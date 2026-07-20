/**
 * Income indexer — reads incoming USDC/EURC payments to an address straight from
 * Arc, and joins each to its Memo event (same tx). The chain is the source of truth.
 *
 * Kept transport-agnostic: pass any viem PublicClient (browser or server) so the
 * verify route (F5) can reuse the exact same derivation the dashboard uses.
 */
import {
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ARC } from "@/config/arc";
import { MEMO_ABI } from "@/lib/abi";
import { TOKENS, tokenByAddress, type TokenMeta } from "@/lib/tokens";
import {
  normalizeMemoLog,
  type PayslipMemo,
} from "@/lib/memo";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const MEMO_EVENT = MEMO_ABI.find(
  (x) => x.type === "event" && x.name === "Memo",
)!;

/** Some RPCs cap getLogs block spans; scan in windows to stay safe. */
const LOG_WINDOW = 50_000n;

export interface Payment {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number; // ms epoch
  from: Address; // payer
  to: Address; // recipient (the user)
  token: TokenMeta;
  /** base-unit amount (bigint) — never lose precision to floats. */
  amount: bigint;
  /** decoded on-chain memo, if the payment carried one. */
  memo: PayslipMemo | null;
  memoId: Hex | null;
}

async function scanTransfers(
  client: PublicClient,
  token: Address,
  to: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const out = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n > toBlock ? toBlock : start + LOG_WINDOW - 1n;
    const logs = await client.getLogs({
      address: token,
      event: TRANSFER_EVENT,
      args: { to },
      fromBlock: start,
      toBlock: end,
    });
    out.push(...logs);
  }
  return out;
}

async function scanMemos(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const out = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n > toBlock ? toBlock : start + LOG_WINDOW - 1n;
    const logs = await client.getLogs({
      address: ARC.contracts.memo as Address,
      event: MEMO_EVENT as any,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...logs);
  }
  return out;
}

export interface FetchOptions {
  /** How many blocks back to scan (default: full history via fromBlock 0). */
  fromBlock?: bigint;
  toBlock?: bigint;
}

/**
 * Fetch all incoming USDC/EURC payments to `address`, memo-enriched, newest first.
 */
export async function fetchIncome(
  client: PublicClient,
  address: Address,
  opts: FetchOptions = {},
): Promise<Payment[]> {
  const latest = opts.toBlock ?? (await client.getBlockNumber());
  const fromBlock = opts.fromBlock ?? 0n;

  // 1. incoming transfers across both tokens
  const transferLogs = (
    await Promise.all(
      TOKENS.map((t) =>
        scanTransfers(client, t.address, address, fromBlock, latest),
      ),
    )
  ).flat();

  // 2. memo events over the same range, indexed by tx hash
  const memoLogs = await scanMemos(client, fromBlock, latest);
  const memoByTx = new Map<string, ReturnType<typeof normalizeMemoLog>>();
  for (const log of memoLogs) {
    const norm = normalizeMemoLog(log as any);
    // one memo per tx in our flows; keep the first seen
    if (!memoByTx.has(norm.txHash)) memoByTx.set(norm.txHash, norm);
  }

  // 3. resolve block timestamps (dedup block fetches)
  const blocks = new Map<bigint, number>();
  await Promise.all(
    [...new Set(transferLogs.map((l) => l.blockNumber!))].map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      blocks.set(bn, Number(block.timestamp) * 1000);
    }),
  );

  // 4. assemble
  const payments: Payment[] = transferLogs.map((log) => {
    const token = tokenByAddress(log.address)!;
    const memo = memoByTx.get(log.transactionHash!);
    return {
      txHash: log.transactionHash! as Hex,
      logIndex: log.logIndex ?? 0,
      blockNumber: log.blockNumber!,
      timestamp: blocks.get(log.blockNumber!) ?? 0,
      from: log.args.from!,
      to: log.args.to!,
      token,
      amount: log.args.value!,
      memo: memo?.memo ?? null,
      memoId: memo?.memoId ?? null,
    };
  });

  payments.sort(
    (a, b) =>
      Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
  );
  return payments;
}
