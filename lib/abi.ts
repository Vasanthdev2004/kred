/**
 * Verified ABIs. ERC-20 is the standard subset we use; MEMO_ABI was read from the
 * deployed Arc Memo contract (0x5294..E505) via arcscan getabi. See docs/arc-notes.md.
 */

export const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Arc Memo contract — the exact interface, verified from the deployed bytecode. */
export const MEMO_ABI = [
  {
    type: "function",
    name: "memo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "data", type: "bytes" },
      { name: "memoId", type: "bytes32" },
      { name: "memoData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "memoIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "CALL_FROM",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Memo",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "callDataHash", type: "bytes32", indexed: false },
      { name: "memoId", type: "bytes32", indexed: true },
      { name: "memo", type: "bytes", indexed: false },
      { name: "memoIndex", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BeforeMemo",
    inputs: [{ name: "memoIndex", type: "uint256", indexed: true }],
  },
  {
    type: "error",
    name: "MemoFailed",
    inputs: [{ name: "returnData", type: "bytes" }],
  },
] as const;
