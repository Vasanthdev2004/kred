// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KredRegistry
/// @notice Tamper-evident anchors for Kred income disclosures on Arc.
/// @dev Each caller anchors an opaque keccak256 digest of a disclosure. The block
///      timestamp is the on-chain proof-of-existence. NO amounts, addresses, or PII
///      are ever stored on-chain — only the caller's own digests. Anchors are keyed
///      by `msg.sender`, so no one can anchor on another wallet's behalf, and the
///      verify page reads `anchoredAt[owner][digest]` for the disclosure's owner.
contract KredRegistry {
    /// @notice owner => digest => unix timestamp of the first anchor (0 = never anchored).
    mapping(address => mapping(bytes32 => uint256)) public anchoredAt;

    /// @notice owner => digest => unix timestamp of revocation (0 = not revoked).
    mapping(address => mapping(bytes32 => uint256)) public revokedAt;

    /// @notice Emitted the first time an (owner, digest) pair is anchored.
    event Anchored(address indexed owner, bytes32 indexed digest, uint256 timestamp);

    /// @notice Emitted the first time an (owner, digest) pair is revoked.
    event Revoked(address indexed owner, bytes32 indexed digest, uint256 timestamp);

    /// @notice Anchor a disclosure digest for the caller.
    /// @dev Idempotent: the first timestamp stands, so re-anchoring can't backdate or
    ///      overwrite an earlier proof. Reverting-free and payable-free by design.
    /// @param digest keccak256 of the disclosure's canonical content (see lib/registry).
    function anchor(bytes32 digest) external {
        if (anchoredAt[msg.sender][digest] == 0) {
            anchoredAt[msg.sender][digest] = block.timestamp;
            emit Anchored(msg.sender, digest, block.timestamp);
        }
    }

    /// @notice Withdraw a disclosure the caller previously shared.
    /// @dev Keyed by `msg.sender`, so only the owner of an anchor can revoke it.
    ///      One-way and idempotent by design: a verifier who has already seen a
    ///      digest reported as revoked must never see it come back, so there is no
    ///      un-revoke and the first timestamp stands. Re-anchoring does not clear it
    ///      (`anchor` is a no-op once set), so revocation is final for this digest;
    ///      sharing again means a new disclosure, which is a new digest.
    /// @param digest keccak256 of the disclosure's canonical content (see lib/registry).
    function revoke(bytes32 digest) external {
        if (revokedAt[msg.sender][digest] == 0) {
            revokedAt[msg.sender][digest] = block.timestamp;
            emit Revoked(msg.sender, digest, block.timestamp);
        }
    }
}
