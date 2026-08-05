// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface. On Arc, USDC is reachable at 0x3600…0000 with 6
///         decimals; this contract only ever speaks the ERC-20 interface, never the
///         18-decimal native coin.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title KredEscrow
/// @notice Milestone-released stablecoin escrow for invoices settled on Arc.
/// @dev Kred proves income after it lands. This covers the part before: a client
///      commits USDC against an invoice and releases it as work is delivered. The
///      payee can see the funds are committed without holding them, which is the
///      working-capital problem an invoice on its own does not solve.
///
///      Deliberately NOT included: arbitration, fees, and any admin key. There is no
///      owner, no pause, and no path by which this contract's author can move anyone's
///      money. A dispute is settled the way it is settled off-chain, between the two
///      parties, because an escrow with a referee is only as trustworthy as the
///      referee and nobody agreed to trust us.
contract KredEscrow {
    /// @notice The only two tokens this escrow will hold, fixed at deployment.
    /// @dev Without this, anyone holding a public /pay link could open() an escrow
    ///      at that invoice id denominated in a worthless token they minted, naming
    ///      the real freelancer as payee. The UI would show funds committed and the
    ///      freelancer would work against nothing. An allowlist means a squatter has
    ///      to lock real USDC to try it.
    address public immutable USDC;
    address public immutable EURC;

    /// @notice Longest window a payer may commit for.
    /// @dev Both exits are payer-only and refund is gated until the deadline, so an
    ///      unbounded deadline (type(uint64).max) would strand funds forever in a
    ///      contract with no owner, no pause and no sweep. On Arc the gas coin IS
    ///      USDC, so a payer who cannot transact cannot rescue their own funds
    ///      either. Bounding the window turns every permanent lock into a delay.
    uint64 public constant MAX_DURATION = 365 days;

    constructor(address usdc, address eurc) {
        require(usdc != address(0) && eurc != address(0), "bad token");
        USDC = usdc;
        EURC = eurc;
    }

    struct Escrow {
        address payer;
        address payee;
        address token;
        uint256 total;    // amount actually received at open
        uint256 released; // cumulative amount pushed to payee
        uint64 deadline;  // after this, the payer may reclaim what is left
        bool closed;      // fully released or refunded; terminal
    }

    /// @notice invoiceId => escrow. The id is chosen by the app (keccak of the
    ///         invoice's canonical content) and must be unique per escrow.
    mapping(bytes32 => Escrow) public escrows;

    event Opened(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 amount,
        uint64 deadline
    );
    event Released(
        bytes32 indexed invoiceId,
        address indexed payee,
        address token,
        uint256 amount,
        uint256 totalReleased,
        uint256 total
    );
    event Refunded(
        bytes32 indexed invoiceId,
        address indexed payer,
        address token,
        uint256 amount
    );

    error AlreadyExists();
    error NotFound();
    error NotPayer();
    error IsClosed();
    error BadAmount();
    error DeadlineInPast();
    error TooEarly();
    error TransferFailed();
    error BadToken();
    error BadDeadline();

    /// @notice Fund an escrow against an invoice. Pulls `amount` from the caller, so
    ///         the caller must have approved this contract for at least `amount`.
    /// @dev Checks-effects-interactions: the record is written and the slot claimed
    ///      BEFORE the token is touched.
    ///
    ///      An earlier draft measured the funded total as a balanceOf delta across
    ///      transferFrom, to be safe against fee-on-transfer tokens. That was worse
    ///      than the problem it solved: balances here are pooled contract-wide but
    ///      accounted per escrow, so a token that yields control during transferFrom
    ///      could reenter open(), be counted in both the inner and outer deltas, and
    ///      claim more than it deposited — paid out of another escrow's principal.
    ///      The allowlist above removes fee-on-transfer tokens from consideration
    ///      entirely, so `amount` is exact and the delta is unnecessary.
    function open(
        bytes32 invoiceId,
        address payee,
        address token,
        uint256 amount,
        uint64 deadline
    ) external {
        if (escrows[invoiceId].payer != address(0)) revert AlreadyExists();
        if (token != USDC && token != EURC) revert BadToken();
        if (payee == address(0) || payee == address(this) || amount == 0) {
            revert BadAmount();
        }
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (deadline > block.timestamp + MAX_DURATION) revert BadDeadline();

        // Effects first: the slot is claimed before any external call, so a reentrant
        // token cannot open twice at this id or observe a half-written record.
        escrows[invoiceId] = Escrow({
            payer: msg.sender,
            payee: payee,
            token: token,
            total: amount,
            released: 0,
            deadline: deadline,
            closed: false
        });

        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        emit Opened(invoiceId, msg.sender, payee, token, amount, deadline);
    }

    /// @notice Release part or all of an escrow to the payee.
    /// @dev Only the payer can release: releasing IS the payer's statement that the
    ///      milestone was delivered. State is written before the transfer, so a
    ///      reentrant token cannot release the same funds twice.
    function release(bytes32 invoiceId, uint256 amount) external {
        Escrow storage e = escrows[invoiceId];
        if (e.payer == address(0)) revert NotFound();
        if (e.closed) revert IsClosed();
        if (msg.sender != e.payer) revert NotPayer();

        uint256 remaining = e.total - e.released;
        if (amount == 0 || amount > remaining) revert BadAmount();

        e.released += amount;
        if (e.released == e.total) e.closed = true;

        // Emit before the transfer. With a callback token, a reentrant inner call's
        // log would otherwise land first and the outer log would report a stale
        // cumulative total, leaving an indexer with events out of order.
        emit Released(invoiceId, e.payee, e.token, amount, e.released, e.total);
        if (!IERC20(e.token).transfer(e.payee, amount)) revert TransferFailed();
    }

    /// @notice After the deadline, the payer reclaims whatever was never released.
    /// @dev Protects the payer from funds stranded if work is never delivered. It
    ///      cannot claw back a release that already happened; those funds have left.
    /// @dev ANYONE may call this once the deadline has passed, but the funds always
    ///      go to `e.payer` — the caller cannot redirect them. Restricting the call
    ///      to the payer added no safety (the destination is fixed either way) and
    ///      removed the only liveness path: an abandoned escrow, or one whose payer
    ///      lost their key, would otherwise resolve to nobody, forever, in a contract
    ///      with no admin and no sweep.
    function refund(bytes32 invoiceId) external {
        Escrow storage e = escrows[invoiceId];
        if (e.payer == address(0)) revert NotFound();
        if (e.closed) revert IsClosed();
        if (block.timestamp < e.deadline) revert TooEarly();

        uint256 remaining = e.total - e.released;
        if (remaining == 0) revert BadAmount();

        e.closed = true;
        emit Refunded(invoiceId, e.payer, e.token, remaining);
        if (!IERC20(e.token).transfer(e.payer, remaining)) revert TransferFailed();
    }

    /// @notice Everything a verifier needs about one escrow, in a single call.
    function statusOf(bytes32 invoiceId)
        external
        view
        returns (
            address payer,
            address payee,
            address token,
            uint256 total,
            uint256 released,
            uint64 deadline,
            bool closed
        )
    {
        Escrow storage e = escrows[invoiceId];
        return (e.payer, e.payee, e.token, e.total, e.released, e.deadline, e.closed);
    }

}
