/**
 * Income indexer. The chain is the source of truth; we read it two ways:
 *   - History via the Arc block explorer's indexed `tokentx` API (fast, full history;
 *     raw eth_getLogs is capped to a 10k block range over ~52M blocks — infeasible).
 *   - Memo enrichment via RPC tx receipts (decode the Memo event in each incoming tx).
 *
 * Both are chain-derived. The DB never stores amounts. The /verify route (F5) reuses
 * `enrichMemos` / receipt recompute on a specific disclosed tx set (trustless, no scan).
 */
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { ARC } from "@/config/arc";
import { tokenByAddress, type TokenMeta } from "@/lib/tokens";
import { parseMemoFromLogs, type PayslipMemo } from "@/lib/memo";

export interface Payment {
  txHash: Hex;
  blockNumber: number;
  timestamp: number; // ms epoch
  from: Address; // payer
  to: Address; // recipient (the user)
  tokenAddress: Address;
  tokenSymbol: TokenMeta["symbol"];
  tokenDecimals: number;
  fiat: TokenMeta["fiat"];
  amount: bigint; // base units
  memo: PayslipMemo | null;
  memoId: Hex | null;
}

/** JSON-safe form crossing the API boundary (bigint -> decimal string). */
export type PaymentDTO = Omit<Payment, "amount"> & { amount: string };

export function toDTO(p: Payment): PaymentDTO {
  return { ...p, amount: p.amount.toString() };
}
export function fromDTO(d: PaymentDTO): Payment {
  return { ...d, amount: BigInt(d.amount) };
}

interface TokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  blockNumber: string;
  timeStamp: string;
}

const MAX_PAGES = 6;
const PAGE_SIZE = 1000;

/** Pull the address's ERC-20 transfers from the explorer, newest first.
 *  `truncated` is true if we hit the page cap with more history still available. */
async function fetchTokenTx(
  address: Address,
): Promise<{ txs: TokenTx[]; truncated: boolean }> {
  const out: TokenTx[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `${ARC.explorerUrl}/api?module=account&action=tokentx` +
      `&address=${address}&sort=desc&page=${page}&offset=${PAGE_SIZE}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) break;
    const json = (await res.json()) as { status?: string; result?: TokenTx[] };
    const rows = Array.isArray(json.result) ? json.result : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true; // full last page → more remains
  }
  return { txs: out, truncated };
}

/** Keep only incoming USDC/EURC transfers to `address`, as Payment rows (no memo yet). */
function toIncomingPayments(txs: TokenTx[], address: Address): Payment[] {
  const me = address.toLowerCase();
  const payments: Payment[] = [];
  for (const tx of txs) {
    if (tx.to?.toLowerCase() !== me) continue; // incoming only
    const token = tokenByAddress(tx.contractAddress);
    if (!token) continue; // USDC/EURC only
    payments.push({
      txHash: tx.hash as Hex,
      blockNumber: Number(tx.blockNumber),
      timestamp: Number(tx.timeStamp) * 1000,
      from: getAddress(tx.from),
      to: getAddress(tx.to),
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      fiat: token.fiat,
      amount: BigInt(tx.value),
      memo: null,
      memoId: null,
    });
  }
  return payments;
}

/** Map with a bounded concurrency so we don't flood the RPC with receipt calls. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Attach decoded memos to payments by reading each tx receipt (bounded).
 *  Memo decoding lives in the lib/memo adapter (single source of truth). */
export async function enrichMemos(
  client: PublicClient,
  payments: Payment[],
  cap = 250,
): Promise<Payment[]> {
  const targets = payments.slice(0, cap);
  await mapLimit(targets, 8, async (p) => {
    try {
      const receipt = await client.getTransactionReceipt({ hash: p.txHash });
      const found = parseMemoFromLogs(receipt.logs);
      if (found) {
        p.memo = found.memo;
        p.memoId = found.memoId;
      }
    } catch {
      /* receipt unavailable — leave untagged */
    }
  });
  return payments;
}

/** Full income read: explorer history + memo enrichment. Newest first. */
export async function fetchIncome(
  client: PublicClient,
  address: Address,
): Promise<{ payments: Payment[]; truncated: boolean }> {
  const { txs, truncated } = await fetchTokenTx(address);
  const payments = toIncomingPayments(txs, address);
  await enrichMemos(client, payments);
  payments.sort((a, b) => b.blockNumber - a.blockNumber);
  return { payments, truncated };
}
