/**
 * Memo adapter — the ONLY place that knows Arc's memo on-chain format.
 * The rest of the app depends on this interface, not on the Memo contract.
 * A docs correction to the memo mechanism should be a one-file change here.
 *
 * Mechanism (verified, see docs/arc-notes.md):
 *   WRITE  Memo.memo(target, data, memoId, memoData)  — wraps a call, emits Memo event.
 *          CALL_FROM preserves msg.sender, so the wrapped transfer runs AS the payer
 *          (no approve needed) and still emits a normal ERC-20 Transfer.
 *   READ   decode the `memo` bytes of the Memo event (same tx as the Transfer).
 */
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  hexToString,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { z } from "zod";
import { ARC } from "@/config/arc";
import { ERC20_ABI, MEMO_ABI } from "@/lib/abi";

/** App-level memo schema encoded into the on-chain `memoData` bytes. */
export const MEMO_SCHEMA_VERSION = 1;

export const payslipMemoSchema = z.object({
  v: z.number().int().default(MEMO_SCHEMA_VERSION),
  client: z.string().max(120).optional(),
  project: z.string().max(120).optional(),
  invoice: z.string().max(60).optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM")
    .optional(),
  category: z.string().max(60).optional(),
  note: z.string().max(200).optional(),
});

// Input type: `v` and all fields optional for callers; `parse` fills the version.
export type PayslipMemo = z.input<typeof payslipMemoSchema>;

export const MEMO_ADDRESS = getAddress(ARC.contracts.memo);

/* ---------------------------------------------------------------- encode */

/** Compact JSON (drop undefined keys) → UTF-8 → hex bytes for `memoData`. */
export function encodeMemoData(memo: PayslipMemo): Hex {
  const parsed = payslipMemoSchema.parse(memo); // fills `v` default
  const compact: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(parsed)) {
    if (val !== undefined && val !== "") compact[k] = val;
  }
  return stringToHex(JSON.stringify(compact));
}

/** UTF-8 bytes → JSON → validated memo, or null if it isn't one of ours. */
export function decodeMemoData(data: Hex | undefined | null): PayslipMemo | null {
  if (!data || data === "0x") return null;
  try {
    const json = JSON.parse(hexToString(data));
    const res = payslipMemoSchema.safeParse(json);
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}

/**
 * App convention for the on-chain `memoId` (bytes32): keccak256("<period>:<invoice>").
 * Lets a verifier group/filter memos by invoice without reading the full blob.
 */
export function computeMemoId(memo: PayslipMemo): Hex {
  return keccak256(stringToHex(`${memo.period ?? ""}:${memo.invoice ?? ""}`));
}

/* ----------------------------------------------------------------- write */

export interface PayWithMemoParams {
  /** Token being sent (USDC/EURC ERC-20 address). */
  token: Address;
  /** Recipient (the freelancer). */
  to: Address;
  /** Amount in base units (bigint). */
  amount: bigint;
  memo: PayslipMemo;
}

/**
 * Build the wagmi `writeContract` request for a pay-with-memo transfer.
 * Calls Memo.memo(token, transfer(to, amount), memoId, memoData).
 */
export function buildPayWithMemo(params: PayWithMemoParams) {
  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [params.to, params.amount],
  });

  return {
    address: MEMO_ADDRESS,
    abi: MEMO_ABI,
    functionName: "memo" as const,
    args: [
      params.token,
      transferData,
      computeMemoId(params.memo),
      encodeMemoData(params.memo),
    ] as const,
  };
}

/* ------------------------------------------------------------------ read */

/** Event fragment to pass to viem `getLogs({ event: MEMO_EVENT })`. */
export const MEMO_EVENT = MEMO_ABI.find(
  (x) => x.type === "event" && x.name === "Memo",
)!;

export interface DecodedMemoLog {
  txHash: Hex;
  logIndex: number;
  sender: Address; // payer
  target: Address; // called contract (token)
  memoId: Hex;
  callDataHash: Hex;
  memo: PayslipMemo | null;
  raw: Hex; // raw memo bytes
}

/**
 * Normalize a decoded Memo log (from viem getLogs with the Memo event) into our shape.
 * `log.args` is present because viem decodes when an `event` is supplied.
 */
export function normalizeMemoLog(
  log: Log & {
    args: {
      sender: Address;
      target: Address;
      callDataHash: Hex;
      memoId: Hex;
      memo: Hex;
      memoIndex: bigint;
    };
  },
): DecodedMemoLog {
  return {
    txHash: log.transactionHash as Hex,
    logIndex: log.logIndex ?? 0,
    sender: log.args.sender,
    target: log.args.target,
    memoId: log.args.memoId,
    callDataHash: log.args.callDataHash,
    memo: decodeMemoData(log.args.memo),
    raw: log.args.memo,
  };
}

const MEMO_ADDR_LC = MEMO_ADDRESS.toLowerCase();

/** Decode the first Payslip Memo event among a tx receipt's logs, if present. */
export function parseMemoFromLogs(
  logs: readonly { address: string; topics: readonly Hex[]; data: Hex }[],
): { memo: PayslipMemo | null; memoId: Hex } | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== MEMO_ADDR_LC) continue;
    try {
      const decoded = decodeEventLog({
        abi: MEMO_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Memo") continue;
      const args = decoded.args as unknown as { memo: Hex; memoId: Hex };
      return { memo: decodeMemoData(args.memo), memoId: args.memoId };
    } catch {
      /* not a Memo log we understand */
    }
  }
  return null;
}
