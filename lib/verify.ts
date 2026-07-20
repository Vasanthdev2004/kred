/**
 * Trustless recompute for the /verify route. Given an address and a disclosed set of
 * tx hashes, we fetch each receipt from Arc and re-derive the incoming USDC/EURC totals
 * ourselves — never trusting any stored amount. Tampering with the DB can't change the
 * result: the DB only holds which tx hashes + which fields to show; the numbers come
 * from chain. A tx that isn't a genuine incoming transfer to `address` is excluded.
 */
import {
  decodeEventLog,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ARC } from "@/config/arc";
import { ERC20_ABI } from "@/lib/abi";
import { tokenBySymbol, type Fiat, type TokenSymbol } from "@/lib/tokens";
import { parseMemoFromLogs, type PayslipMemo } from "@/lib/memo";

// USDC is Arc's native coin — its Transfer events come from this system address in
// 18 decimals; EURC is a normal ERC-20 (6 decimals). See docs/arc-notes.md.
const NATIVE_USDC_EMITTER = ARC.contracts.nativeUsdcEmitter.toLowerCase();
const USDC_LC = ARC.contracts.usdc.toLowerCase();
const EURC_LC = ARC.contracts.eurc.toLowerCase();
const NATIVE_TO_ERC20 = 1_000_000_000_000n; // 18dp -> 6dp

export interface VerifiedTx {
  txHash: Hex;
  verified: boolean;
  tokenSymbol: TokenSymbol;
  tokenDecimals: number;
  fiat: Fiat;
  amount: bigint;
  from: Address;
  timestamp: number; // ms epoch (0 if unknown)
  memo: PayslipMemo | null;
}

export interface RecomputeTotal {
  symbol: TokenSymbol;
  decimals: number;
  fiat: Fiat;
  amount: bigint;
  count: number;
}

export interface RecomputeResult {
  txs: VerifiedTx[];
  totals: RecomputeTotal[];
  verifiedCount: number;
  failedCount: number;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function recompute(
  client: PublicClient,
  address: Address,
  txHashes: Hex[],
): Promise<RecomputeResult> {
  const me = address.toLowerCase();
  const unique = [...new Set(txHashes.map((h) => h.toLowerCase() as Hex))];

  // 1. fetch receipts + derive incoming USDC/EURC per tx.
  //    USDC is native → its Transfer comes from 0xff..fe in 18dp; EURC is a normal
  //    ERC-20 (6dp). We normalize USDC to 6dp and prefer the native ledger event.
  const partial = await mapLimit(unique, 8, async (txHash) => {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") return null;

      const memo = parseMemoFromLogs(receipt.logs)?.memo ?? null;
      let usdcNative = 0n;
      let usdcErc20 = 0n;
      let eurc = 0n;
      let from: Address | undefined;

      for (const log of receipt.logs) {
        const emitter = log.address.toLowerCase();
        const isNative = emitter === NATIVE_USDC_EMITTER;
        const isUsdc = emitter === USDC_LC;
        const isEurc = emitter === EURC_LC;
        if (!isNative && !isUsdc && !isEurc) continue;

        let decoded;
        try {
          decoded = decodeEventLog({
            abi: ERC20_ABI,
            data: log.data,
            topics: log.topics as [Hex, ...Hex[]],
          });
        } catch {
          continue; // Transfer-shaped log we can't decode with this ABI
        }
        if (decoded.eventName !== "Transfer") continue;
        const args = decoded.args as unknown as {
          from: Address;
          to: Address;
          value: bigint;
        };
        if (args.to.toLowerCase() !== me) continue;
        from ??= args.from;
        if (isNative) usdcNative += args.value / NATIVE_TO_ERC20;
        else if (isUsdc) usdcErc20 += args.value;
        else eurc += args.value;
      }

      const usdc = usdcNative > 0n ? usdcNative : usdcErc20;
      const tokens: { symbol: TokenSymbol; amount: bigint }[] = [];
      if (usdc > 0n) tokens.push({ symbol: "USDC", amount: usdc });
      if (eurc > 0n) tokens.push({ symbol: "EURC", amount: eurc });
      if (tokens.length === 0) return null; // not an incoming transfer to us

      return {
        txHash,
        blockNumber: receipt.blockNumber,
        memo,
        from: from ?? zeroAddress,
        tokens,
      };
    } catch {
      return null;
    }
  });

  // 2. resolve block timestamps (deduped)
  const blockNums = [
    ...new Set(partial.filter(Boolean).map((p) => p!.blockNumber)),
  ];
  const tsByBlock = new Map<bigint, number>();
  await mapLimit(blockNums, 8, async (bn) => {
    try {
      const block = await client.getBlock({ blockNumber: bn });
      tsByBlock.set(bn, Number(block.timestamp) * 1000);
    } catch {
      /* leave unknown */
    }
  });

  // 3. assemble verified txs + totals
  const txs: VerifiedTx[] = [];
  const totals = new Map<TokenSymbol, RecomputeTotal>();
  let verifiedCount = 0;
  let failedCount = 0;

  for (const h of unique) {
    const p = partial.find((x) => x?.txHash === h);
    if (!p) {
      failedCount++;
      continue;
    }
    verifiedCount++;
    for (const { symbol, amount } of p.tokens) {
      const token = tokenBySymbol(symbol);
      txs.push({
        txHash: p.txHash,
        verified: true,
        tokenSymbol: symbol,
        tokenDecimals: token.decimals,
        fiat: token.fiat,
        amount,
        from: p.from,
        timestamp: tsByBlock.get(p.blockNumber) ?? 0,
        memo: p.memo,
      });
      const t = totals.get(symbol) ?? {
        symbol,
        decimals: token.decimals,
        fiat: token.fiat,
        amount: 0n,
        count: 0,
      };
      t.amount += amount;
      t.count += 1;
      totals.set(symbol, t);
    }
  }

  txs.sort((a, b) => b.timestamp - a.timestamp);
  return {
    txs,
    totals: [...totals.values()],
    verifiedCount,
    failedCount,
  };
}
