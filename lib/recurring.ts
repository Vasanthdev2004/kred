/**
 * Recurring-client detection + per-token MRR. Pure: it reads payments the indexer has
 * already produced, and has no React, no network, and no clock of its own (`now` is
 * injected) so every branch here is unit-testable.
 *
 * Kred is a proof-of-income product, so the bar for the word "recurring" is set
 * deliberately high. A false pattern is a trust bug; an unclaimed one is only a missed
 * highlight. Two payments are a coincidence — a gap cannot repeat until the third — so
 * a stream needs MIN_CYCLES separate payment dates whose median gap lands inside the
 * monthly band before anything is labelled.
 *
 * Everything monetary stays bigint base units, and nothing ever crosses currencies:
 * a client's USDC history and their EURC history are two separate streams with two
 * separate MRR figures. There is no FX anywhere in this file.
 */
import type { Address } from "viem";
import type { Payment } from "@/lib/indexer";
import type { TagLike } from "@/lib/statement";
import type { Fiat, TokenSymbol } from "@/lib/tokens";

const DAY_MS = 86_400_000;

/** Separate payment dates required before a stream can be called recurring. */
export const MIN_CYCLES = 3;

/** The monthly band, in days between consecutive payment dates. Wide enough for real
 *  calendar months (28-31) plus a working week of invoice drift on either side; tight
 *  enough to exclude fortnightly (~14) and quarterly (~91) payers, which are regular
 *  but are not what an MRR figure claims. */
export const MONTHLY_MIN_DAYS = 24;
export const MONTHLY_MAX_DAYS = 38;

/** Payments landing this close together are one invoice cycle settled in parts, not
 *  two cycles. Without this a split payment injects a ~0-day gap that destroys the
 *  median and hides a genuine monthly client. */
const SAME_CYCLE_DAYS = 2;

/** Floor on the lateness grace period; the real window is the larger of this and half
 *  the stream's own cadence, so a 30-day client gets ~15 days before reading lapsed. */
const LATE_GRACE_DAYS = 7;

/** Gap drift (as a fraction of the median) at which regularity bottoms out at 0. */
const MAX_DRIFT = 0.5;

/** Display order for per-token figures. An order, not a ranking: the two are compared
 *  only within themselves. */
const TOKEN_ORDER: TokenSymbol[] = ["USDC", "EURC"];

export type Cadence = "monthly" | "irregular" | "insufficient";
export type CadenceStatus = "on-track" | "due" | "lapsed" | "unknown";
export type Confidence = "high" | "medium" | "low";

/**
 * One client's history in ONE token. A client paying both USDC and EURC produces two
 * streams, and the two are never added together.
 */
export interface ClientStream {
  /** Stable grouping key: "<normalized client name or payer address>|<symbol>". */
  key: string;
  /** What to show: the client name if we have one, else the checksummed payer address. */
  label: string;
  /** False when `label` is an address, i.e. nothing in this stream carried a client. */
  named: boolean;
  /** Payer addresses in this stream. A named client may pay from more than one wallet. */
  payers: Address[];
  symbol: TokenSymbol;
  fiat: Fiat;
  decimals: number;
  /** Individual payments. */
  count: number;
  /** Payment cycles: same-day (within SAME_CYCLE_DAYS) payments counted once. */
  cycles: number;
  /** Everything received from this client in this token, base units. */
  total: bigint;
  /** Mean amount per cycle, base units. Integer division, so it is a display figure;
   *  `total` is the exact number. */
  averageAmount: bigint;
  /** Representative recent amount: the median of the last three cycles, which shrugs
   *  off one outlier and tracks the current rate rather than the all-time average.
   *  For a monthly stream this is exactly its contribution to MRR. */
  typicalAmount: bigint;
  firstPaidAt: number; // ms epoch
  lastPaidAt: number; // ms epoch
  /** Median days between cycles. Null with fewer than two cycles (no gap to measure). */
  medianIntervalDays: number | null;
  /** ESTIMATE ONLY, and only for monthly streams: last payment + the median gap. This
   *  describes the past cadence continuing, it does not predict that it will. Null
   *  whenever there is no monthly cadence to extend. */
  nextExpectedAt: number | null;
  /** Whole days between the last payment and `now`. */
  daysSinceLast: number;
  cadence: Cadence;
  status: CadenceStatus;
  /** 0-1: how tightly the gaps cluster around the median. Drives `confidence`. */
  regularity: number;
  /** How much evidence stands behind the label, from cycle count, regularity, and
   *  whether the stream is still live. Never a statement about future income. */
  confidence: Confidence;
  /** True when the cadence is monthly, including streams that have since lapsed. */
  recurring: boolean;
}

/** Monthly recurring revenue for a single token. Never summed with another token. */
export interface MrrTotal {
  symbol: TokenSymbol;
  fiat: Fiat;
  decimals: number;
  /** Sum of each live recurring stream's `typicalAmount`, base units. */
  amount: bigint;
  /** Recurring clients contributing, in this token. */
  clients: number;
}

export interface RecurringSummary {
  /** Every client/token group, recurring or not. */
  streams: ClientStream[];
  /** Monthly cadence and not lapsed. These are the streams behind `mrr`. */
  recurring: ClientStream[];
  /** Monthly cadence but silent past the grace window. Counted nowhere in `mrr`. */
  lapsed: ClientStream[];
  /** Per-token MRR, in TOKEN_ORDER. Empty when nothing qualifies (an empty list, not
   *  a zero: callers render "—" rather than claiming 0). */
  mrr: MrrTotal[];
  /** The `now` every date comparison used, so the UI can date its own estimate. */
  evaluatedAt: number;
}

export interface DetectOptions {
  /** Injected clock. Defaults to Date.now(). */
  now?: number;
}

/* -------------------------------------------------------------- small helpers */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median over base-unit amounts. Stays in bigint — no float ever touches money. */
function medianBig(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

/** Case/whitespace-insensitive form of a client name, for grouping only. */
const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Effective client name for a payment: on-chain memo first, then the manual tag
 *  (same precedence as buildStatement). Blank strings count as absent. */
function clientName(p: Payment, tagByTx: Map<string, TagLike>): string | null {
  const tag = tagByTx.get(p.txHash.toLowerCase());
  const raw = p.memo?.client ?? tag?.client ?? null;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pick each payer address's dominant client name (most tagged, ties to the most
 * recent). Used to back-fill payments that were never tagged: one missing memo must
 * not split a client's history into two half-streams, neither of which then clears
 * the recurring bar.
 */
function namesByPayer(
  payments: Payment[],
  tagByTx: Map<string, TagLike>,
): Map<string, { norm: string; label: string }> {
  const tallies = new Map<string, Map<string, { hits: number; at: number; label: string }>>();

  for (const p of payments) {
    const name = clientName(p, tagByTx);
    if (!name) continue;
    const payer = p.from.toLowerCase();
    const byName = tallies.get(payer) ?? new Map();
    const norm = normalizeName(name);
    const seen = byName.get(norm);
    if (seen) {
      seen.hits += 1;
      if (p.timestamp > seen.at) {
        seen.at = p.timestamp;
        seen.label = name; // freshest spelling wins
      }
    } else {
      byName.set(norm, { hits: 1, at: p.timestamp, label: name });
    }
    tallies.set(payer, byName);
  }

  const out = new Map<string, { norm: string; label: string }>();
  for (const [payer, byName] of tallies) {
    const [norm, best] = [...byName.entries()].sort(
      (a, b) => b[1].hits - a[1].hits || b[1].at - a[1].at,
    )[0];
    out.set(payer, { norm, label: best.label });
  }
  return out;
}

interface Cycle {
  /** First payment in the cycle. */
  at: number;
  /** Summed base units across the payments folded into it. */
  amount: bigint;
  payments: number;
}

/**
 * Fold a stream's payments into cycles. Distance is measured from the cycle's START,
 * so a client paying every day for a fortnight stays fourteen cycles rather than
 * collapsing into one.
 */
function toCycles(items: { at: number; amount: bigint }[]): Cycle[] {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const cycles: Cycle[] = [];
  for (const item of sorted) {
    const open = cycles[cycles.length - 1];
    if (open && item.at - open.at <= SAME_CYCLE_DAYS * DAY_MS) {
      open.amount += item.amount;
      open.payments += 1;
      continue;
    }
    cycles.push({ at: item.at, amount: item.amount, payments: 1 });
  }
  return cycles;
}

function confidenceOf(
  cadence: Cadence,
  cycles: number,
  regularity: number,
  status: CadenceStatus,
): Confidence {
  // Anything we would not call recurring, and anything that has gone quiet, tops out
  // at "low" no matter how neat its history looks.
  if (cadence !== "monthly" || status === "lapsed") return "low";
  if (cycles >= 6 && regularity >= 0.6) return "high";
  if (cycles >= 4 && regularity >= 0.45) return "medium";
  return "low"; // three clean cycles is a pattern, but it is thin evidence
}

/* ------------------------------------------------------------------- detection */

interface Bucket {
  key: string;
  label: string;
  named: boolean;
  payers: Map<string, Address>;
  symbol: TokenSymbol;
  fiat: Fiat;
  decimals: number;
  items: { at: number; amount: bigint }[];
}

/**
 * Group payments into client/token streams and measure each one's cadence.
 *
 * @param payments  incoming payments (any order); only these are ever considered, so
 *                  a truncated history yields a conservative, understated result.
 * @param tagByTx   manual tags keyed by lowercased tx hash, as buildStatement takes.
 */
export function detectRecurring(
  payments: Payment[],
  tagByTx: Map<string, TagLike> = new Map(),
  options: DetectOptions = {},
): RecurringSummary {
  const now = options.now ?? Date.now();
  const backfill = namesByPayer(payments, tagByTx);
  const buckets = new Map<string, Bucket>();

  for (const p of payments) {
    const own = clientName(p, tagByTx);
    const payer = p.from.toLowerCase();
    const inherited = own ? undefined : backfill.get(payer);
    const norm = own ? normalizeName(own) : (inherited?.norm ?? payer);
    const key = `${norm}|${p.tokenSymbol}`;

    const bucket = buckets.get(key) ?? {
      key,
      label: own ?? inherited?.label ?? p.from,
      named: Boolean(own ?? inherited),
      payers: new Map<string, Address>(),
      symbol: p.tokenSymbol,
      fiat: p.fiat,
      decimals: p.tokenDecimals,
      items: [],
    };
    bucket.payers.set(payer, p.from);
    bucket.items.push({ at: p.timestamp, amount: p.amount });
    buckets.set(key, bucket);
  }

  const streams: ClientStream[] = [];

  for (const bucket of buckets.values()) {
    const cycles = toCycles(bucket.items);
    const firstPaidAt = cycles[0].at;
    const lastPaidAt = cycles[cycles.length - 1].at;

    let total = 0n;
    for (const c of cycles) total += c.amount;

    // Gaps between consecutive cycles, in days. Time is the one thing measured in
    // floats here; money never is.
    const gaps = cycles
      .slice(1)
      .map((c, i) => (c.at - cycles[i].at) / DAY_MS);
    const medianIntervalDays = gaps.length ? median(gaps) : null;

    const cadence: Cadence =
      cycles.length < MIN_CYCLES || medianIntervalDays === null
        ? "insufficient"
        : medianIntervalDays >= MONTHLY_MIN_DAYS &&
            medianIntervalDays <= MONTHLY_MAX_DAYS
          ? "monthly"
          : "irregular";

    // Regularity scores the WORST gap, not the average one: a stream that skipped a
    // month is less dependable than its mean deviation would suggest.
    const regularity =
      medianIntervalDays && gaps.length
        ? clamp01(
            1 -
              Math.max(...gaps.map((g) => Math.abs(g - medianIntervalDays))) /
                medianIntervalDays /
                MAX_DRIFT,
          )
        : 0;

    const nextExpectedAt =
      cadence === "monthly" && medianIntervalDays !== null
        ? lastPaidAt + Math.round(medianIntervalDays * DAY_MS)
        : null;

    let status: CadenceStatus = "unknown";
    if (nextExpectedAt !== null && medianIntervalDays !== null) {
      const graceMs =
        Math.max(LATE_GRACE_DAYS, medianIntervalDays * 0.5) * DAY_MS;
      status =
        now <= nextExpectedAt
          ? "on-track"
          : now <= nextExpectedAt + graceMs
            ? "due"
            : "lapsed";
    }

    streams.push({
      key: bucket.key,
      label: bucket.label,
      named: bucket.named,
      payers: [...bucket.payers.values()],
      symbol: bucket.symbol,
      fiat: bucket.fiat,
      decimals: bucket.decimals,
      count: bucket.items.length,
      cycles: cycles.length,
      total,
      averageAmount: total / BigInt(cycles.length),
      typicalAmount: medianBig(cycles.slice(-3).map((c) => c.amount)),
      firstPaidAt,
      lastPaidAt,
      medianIntervalDays,
      nextExpectedAt,
      daysSinceLast: Math.max(0, Math.floor((now - lastPaidAt) / DAY_MS)),
      cadence,
      status,
      regularity,
      confidence: confidenceOf(cadence, cycles.length, regularity, status),
      recurring: cadence === "monthly",
    });
  }

  streams.sort(compareStreams);

  const recurring = streams.filter((s) => s.recurring && s.status !== "lapsed");
  const lapsed = streams.filter((s) => s.recurring && s.status === "lapsed");

  // MRR: one figure per token, summed only over live recurring streams. A lapsed
  // client is not recurring revenue, and a USDC figure never absorbs a EURC one.
  const mrrBySymbol = new Map<TokenSymbol, MrrTotal>();
  for (const s of recurring) {
    const t = mrrBySymbol.get(s.symbol) ?? {
      symbol: s.symbol,
      fiat: s.fiat,
      decimals: s.decimals,
      amount: 0n,
      clients: 0,
    };
    t.amount += s.typicalAmount;
    t.clients += 1;
    mrrBySymbol.set(s.symbol, t);
  }

  return {
    streams,
    recurring,
    lapsed,
    mrr: [...mrrBySymbol.values()].sort(
      (a, b) => TOKEN_ORDER.indexOf(a.symbol) - TOKEN_ORDER.indexOf(b.symbol),
    ),
    evaluatedAt: now,
  };
}

/** Live recurring first, then grouped by token so amounts are only ever compared
 *  against the same currency, biggest first. */
function compareStreams(a: ClientStream, b: ClientStream): number {
  const live = (s: ClientStream) => (s.recurring && s.status !== "lapsed" ? 0 : 1);
  if (live(a) !== live(b)) return live(a) - live(b);

  const token = TOKEN_ORDER.indexOf(a.symbol) - TOKEN_ORDER.indexOf(b.symbol);
  if (token !== 0) return token;

  if (a.typicalAmount !== b.typicalAmount) return a.typicalAmount > b.typicalAmount ? -1 : 1;
  return b.cycles - a.cycles || b.lastPaidAt - a.lastPaidAt;
}
