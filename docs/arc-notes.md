# Arc — verified integration notes

> **Source of truth for all Arc-specific constants.** Every value below was read
> first-hand from Arc docs / the Arc testnet block explorer on **2026-07-20**, not
> invented. If a docs correction is needed, change it **here** and in
> [`config/arc.ts`](../config/arc.ts) — nowhere else.

## Chain config (Arc testnet)

| Field | Value |
|---|---|
| Chain ID | `5042002` (`0x4CEF52`) |
| RPC (HTTP) | `https://rpc.testnet.arc.network` |
| RPC (WS) | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` (Blockscout) |
| Faucet | `https://faucet.circle.com` |
| Native gas token | **USDC** — `18` decimals as the *native* coin |

Arc is an EVM L1 by Circle (Reth execution layer). Standard Solidity / Foundry /
Hardhat / viem / wagmi work unmodified. Sub-second deterministic finality.

> ⚠️ **Decimals footgun.** USDC is the native gas coin at **18 decimals**, but the
> **ERC-20 USDC interface is 6 decimals**. All income math uses the ERC-20 interface
> (6 dp). Never mix the two.

## Token contracts (Arc testnet)

| Token | Address | ERC-20 decimals | Fiat |
|---|---|---|---|
| USDC | `0x3600000000000000000000000000000000000000` | 6 | USD |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | EUR |

## Transaction Memos — the hero primitive (verified ABI)

Memos are **not** a field on a plain transfer. Arc ships a **predeployed Memo
contract** that wraps a call and emits a `Memo` event alongside it. It routes the
inner call through the **`CALL_FROM` precompile**, which **preserves the original
`msg.sender`**. Consequence that makes this whole app work:

> A memo'd USDC payment still emits a normal ERC-20 `Transfer` event with the **real
> payer** as `from`, **and** a `Memo` event carrying our JSON — **in the same tx**.
> Read path (F1) and write path (F3) join on **transaction hash**.

### Addresses

| Contract | Address |
|---|---|
| Memo | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |
| Multicall3From | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` |
| `CALL_FROM` precompile | `0x1800000000000000000000000000000000000003` |

Other genesis precompiles (from the verified `Precompiles.sol`): NativeCoinAuthority
`0x18..00`, NativeCoinControl `0x18..01`, SystemAccounting `0x18..02`,
CALL_FROM `0x18..03`, PQ `0x18..04`.

### Verified ABI (read from the deployed contract on arcscan, Circle / Apache-2.0)

```solidity
// WRITE: wrap a call to `target` and attach a memo.
// Because CALL_FROM preserves msg.sender, the inner call executes AS the payer,
// so no ERC-20 approve is needed for a self-initiated transfer.
function memo(address target, bytes data, bytes32 memoId, bytes memoData) external;

function memoIndex() external view returns (uint256);
function CALL_FROM() external view returns (address);

// READ: one Memo event per wrapped call.
event Memo(
    address indexed sender,      // original payer (msg.sender preserved)
    address indexed target,      // the called contract (e.g. USDC)
    bytes32         callDataHash,// keccak256(data) — binds memo to the exact call
    bytes32 indexed memoId,      // app-chosen id (we hash invoice/period)
    bytes           memo,        // arbitrary bytes — we store compact JSON here
    uint256         memoIndex
);
event BeforeMemo(uint256 indexed memoIndex);
error MemoFailed(bytes returnData);
```

### How WE use it

- **memoData (`bytes memo`)** — compact UTF-8 JSON of our app schema (below).
- **memoId (`bytes32`)** — app convention: `keccak256(utf8("<period>:<invoice>"))`.
  Lets a verifier group/filter memos without reading the full blob.
- **Write (F3):** `Memo.memo(USDC, encodeFunctionData(erc20.transfer,[to,amount]), memoId, memoData)`.
- **Read (F1/F2):** `getLogs` the `Memo` event, decode `memo` bytes → JSON, join to the
  `Transfer` in the same `txHash`.

### App-level memo schema (encoded into `memoData`)

```json
{ "v": 1, "client": "Acme Inc", "project": "Website redesign",
  "invoice": "INV-2026-014", "period": "2026-03",
  "category": "development", "note": "March retainer" }
```

`memo` is arbitrary `bytes` (no tight size limit like a 32-byte field), so compact
JSON is fine. Keep it small anyway — it's calldata the payer pays gas on.

## Reading payment history

The **chain is the source of truth for every amount**; the DB stores only tags +
disclosure prefs. Two hard-won specifics (verified 2026-07-20):

1. **`eth_getLogs` is capped to a 10,000-block range** (`-32614`), over a chain that is
   already ~52M blocks. A from-genesis `Transfer` scan is infeasible. So:
   - **History (F1):** read the explorer's indexed `tokentx` API, not raw `getLogs`.
   - **Verify (F5):** recompute from the *specific disclosed tx hashes* via
     `getTransactionReceipt` — exact, trustless, and needs no range scan.

2. **USDC is Arc's NATIVE coin → its `Transfer` events are emitted by the system
   address `0xffff…fffe` in 18 decimals**, NOT by the `0x3600…` contract and NOT in 6
   decimals. ("Two interfaces for one token.") To get the 6-decimal ERC-20 amount,
   divide the native value by `1e12`. EURC is an ordinary ERC-20 (emitted by
   `0x89B5…`, 6 dp). When recomputing USDC, prefer the native (`0xffff…fffe`) event and
   fall back to a `0x3600…` event; never double-count both. A tx with no verifiable
   incoming transfer to the address is **excluded** from the total (not trusted).

## Open items intentionally deferred

- Opt-in privacy / confidential transactions (APS) **encrypt amounts off the public
  ledger and are a roadmap item — NOT live.** Do **not** build selective disclosure
  (F5) on it; it would break trustless recompute. F5 discloses tx hashes for the
  verified view instead.
- FX: USDC (USD) vs EURC (EUR) must not be summed blindly — see statement engine.

## Primary sources

- Arc docs index: `https://docs.arc.io/llms.txt`
- Contract addresses: `https://docs.arc.io/arc/references/contract-addresses`
- Connect to Arc: `https://docs.arc.io/arc/references/connect-to-arc`
- Memo ABI (authoritative): arcscan getabi for `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`
- Circle first-party skill: `github.com/circlefin/skills` → `plugins/circle/skills/use-arc`
