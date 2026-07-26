/**
 * Income Health: descriptive statistics over an income statement (lib/statement.ts).
 *
 * These are DESCRIPTIVE ONLY — counts, a mean, a dispersion ratio and one share.
 * Nothing here is a score, a rating, a verdict or a recommendation, and no figure is
 * weighted or thresholded to imply one. Whatever renders this must keep it that way.
 *
 * Two rules the maths follows:
 *   - Per token, always. USDC and EURC are different currencies, so they are never
 *     summed and never FX-converted (buildStatement ranks per-currency for the same
 *     reason). Every figure below belongs to exactly one token.
 *   - Sums stay bigint (base units) so they equal the on-chain sums exactly. The only
 *     float conversion is the formatUnits -> Number used for the dispersion ratio,
 *     which is unitless and has no base-unit representation.
 *
 * Small N is reported honestly: with fewer than MIN_MONTHS_FOR_TREND months in the
 * window, volatility and streak are `null` so the UI can say "Not enough history"
 * instead of printing a confident-looking number derived from one or two points.
 */
import { formatUnits } from "viem";
import type { Statement, StatementTx } from "@/lib/statement";
import { TOKENS, type TokenSymbol } from "@/lib/tokens";

/** Below this many months in the window, dispersion and streak describe nothing real. */
export const MIN_MONTHS_FOR_TREND = 3;

/** Report order, taken from the token registry so a new token can't be silently dropped. */
const TOKEN_ORDER: TokenSymbol[] = TOKENS.map((t) => t.symbol);

export interface MonthlySeries {
  symbol: TokenSymbol;
  decimals: number;
  /** contiguous YYYY-MM window, ascending — months with no income are kept, as 0n */
  months: string[];
  /** per-month totals in base units, index-aligned with `months` */
  amounts: bigint[];
}

export interface TopPayer {
  /** the memo/tag client name, or the payer address when the payments carry no label */
  name: string;
  /** true when `name` is a raw address, so the caller can shorten() it for display */
  isAddress: boolean;
  /** this payer's total for the token, base units */
  amount: bigint;
  /** fraction (0..1) of the token's total, NOT a percentage */
  share: number;
}

export interface TokenHealth {
  symbol: TokenSymbol;
  decimals: number;
  /** exact window total, base units */
  total: bigint;
  paymentCount: number;
  /** the window these figures describe, ascending YYYY-MM */
  months: string[];
  monthsInWindow: number;
  /** months in the window with at least one payment */
  monthsActive: number;
  /** mean per window month, base units — null when the window is empty */
  averageMonthly: bigint | null;
  /** coefficient of variation of the monthly totals — null when not meaningful */
  volatility: number | null;
  /** longest run of consecutive months with income — null when not meaningful */
  longestStreak: number | null;
  /** the largest single payer — null when nothing was received */
  topPayer: TopPayer | null;
}

export interface IncomeHealth {
  /** tokens with income in the window, in report order */
  tokens: TokenSymbol[];
  byToken: Partial<Record<TokenSymbol, TokenHealth>>;
}

const ym = (ts: number) => new Date(ts).toISOString().slice(0, 7);
const num = (amount: bigint, decimals: number) => Number(formatUnits(amount, decimals));

/** Enumerate the YYYY-MM strings from `from`..`to` inclusive (mirrors lib/statement). */
function monthsBetween(from: string, to: string): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * One token's monthly totals over a contiguous window.
 *
 * The window is the statement's own months (which buildStatement enumerated from the
 * caller's from..to) unioned with the months that actually carry income, then filled in
 * end to end. That union matters: with no range selected buildStatement leaves byMonth
 * empty, and the payments alone have to define the window. Dry months are kept at 0n —
 * a month without income is real variation, not a missing sample.
 *
 * Sums are taken from `txs` (bigint) rather than `byMonth` (already floats), so the
 * per-month figures equal the chain exactly.
 */
export function monthlySeries(
  statement: Statement,
  symbol: TokenSymbol,
): MonthlySeries {
  const rows = statement.txs.filter((t) => t.symbol === symbol);
  const decimals = statement.totals[symbol]?.decimals ?? rows[0]?.decimals ?? 0;

  const keys = [
    ...statement.byMonth.map((m) => m.month),
    ...rows.map((r) => ym(r.timestamp)),
  ].sort();
  const months = keys.length ? monthsBetween(keys[0], keys[keys.length - 1]) : [];

  const index = new Map(months.map((m, i) => [m, i]));
  const amounts = months.map(() => 0n);
  for (const r of rows) {
    const i = index.get(ym(r.timestamp));
    if (i !== undefined) amounts[i] += r.amount;
  }

  return { symbol, decimals, months, amounts };
}

/** Months in the window that received at least one payment. */
export function monthsActive(series: MonthlySeries): number {
  return series.amounts.reduce((n, a) => (a > 0n ? n + 1 : n), 0);
}

/** Mean per window month, base units. Integer division truncates below one minor unit,
 *  which keeps the figure exact-to-the-cent rather than float-approximate. */
export function averageMonthlyIncome(series: MonthlySeries): bigint | null {
  const n = series.months.length;
  if (n === 0) return null;
  let total = 0n;
  for (const a of series.amounts) total += a;
  return total / BigInt(n);
}

/**
 * Coefficient of variation (population std dev / mean) of the monthly totals — a plain
 * unitless measure of how much the months differ from each other.
 *
 * Null rather than a number when the window is too short to say anything, or when the
 * mean is zero (the ratio is undefined there; printing "0" would read as "perfectly
 * steady" when the truth is "no income").
 */
export function volatility(series: MonthlySeries): number | null {
  const n = series.months.length;
  if (n < MIN_MONTHS_FOR_TREND) return null;
  const values = series.amounts.map((a) => num(a, series.decimals));
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance) / mean;
}

/** Longest run of consecutive months with income. Null under MIN_MONTHS_FOR_TREND:
 *  "a 2 month streak" out of a 2 month window is an artefact of the window, not a fact
 *  about the income. */
export function longestStreak(series: MonthlySeries): number | null {
  if (series.months.length < MIN_MONTHS_FOR_TREND) return null;
  let best = 0;
  let run = 0;
  for (const a of series.amounts) {
    run = a > 0n ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The largest single payer's share of one token's total.
 *
 * Recomputed from `txs` instead of read off `statement.byClient`, which can't answer
 * this: that breakdown is ranked USDC-first (so its top row is the wrong payer for
 * EURC) and it buckets every unlabelled payment under one "Untitled client" name, which
 * would read as a single dominant client when it is really N unknown ones. Here a
 * payment with no client label counts under its own payer address.
 */
export function clientConcentration(
  txs: StatementTx[],
  symbol: TokenSymbol,
): TopPayer | null {
  const buckets = new Map<string, { name: string; isAddress: boolean; amount: bigint }>();
  let total = 0n;

  for (const t of txs) {
    if (t.symbol !== symbol) continue;
    const label = t.client?.trim();
    const key = label ? `client:${label.toLowerCase()}` : `payer:${t.from.toLowerCase()}`;
    const bucket = buckets.get(key) ?? {
      name: label ?? t.from,
      isAddress: !label,
      amount: 0n,
    };
    bucket.amount += t.amount;
    buckets.set(key, bucket);
    total += t.amount;
  }

  if (total <= 0n) return null;

  let top = null as { name: string; isAddress: boolean; amount: bigint } | null;
  for (const b of buckets.values()) {
    if (!top || b.amount > top.amount) top = b;
  }
  if (!top) return null;

  // Basis points first, one divide at the end: the ratio never touches a float sum.
  return { ...top, share: Number((top.amount * 10_000n) / total) / 10_000 };
}

/** Every figure above, per token. Tokens with no income in the window are omitted. */
export function buildIncomeHealth(statement: Statement): IncomeHealth {
  const tokens = TOKEN_ORDER.filter((s) => statement.totals[s] !== undefined);
  const byToken: Partial<Record<TokenSymbol, TokenHealth>> = {};

  for (const symbol of tokens) {
    const total = statement.totals[symbol]!;
    const series = monthlySeries(statement, symbol);
    byToken[symbol] = {
      symbol,
      decimals: total.decimals,
      total: total.amount,
      paymentCount: total.count,
      months: series.months,
      monthsInWindow: series.months.length,
      monthsActive: monthsActive(series),
      averageMonthly: averageMonthlyIncome(series),
      volatility: volatility(series),
      longestStreak: longestStreak(series),
      topPayer: clientConcentration(statement.txs, symbol),
    };
  }

  return { tokens, byToken };
}
