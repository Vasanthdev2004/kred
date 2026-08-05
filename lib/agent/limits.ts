/**
 * Quota + abuse limits for the Kred agent.
 *
 * The keys are personal Ollama Pro accounts, so the scarce resource is plan quota
 * rather than per-token billing. Two jobs here:
 *
 *   1. Rotate across however many keys are configured, so throughput is the sum of
 *      the plans instead of one account's ceiling.
 *   2. Cap usage per wallet and per IP, because the endpoint is public. Without a
 *      cap, one script can drain every account's quota in minutes and the agent is
 *      simply down for everyone else.
 *
 * State is in-memory and therefore per-instance: it resets on redeploy and does not
 * coordinate across replicas. That is deliberate for now (no Redis dependency), and
 * it is a real limitation to fix before this sees real traffic — a determined abuser
 * can reset their budget by waiting for a deploy.
 */

/** Keys, in priority order. Accepts either OLLAMA_API_KEY (single or comma-separated)
 *  or the numbered OLLAMA_API_KEY_1..N form. Server-only — never NEXT_PUBLIC_. */
function loadKeys(): string[] {
  const out: string[] = [];
  const multi = process.env.OLLAMA_API_KEY;
  if (multi) out.push(...multi.split(",").map((k) => k.trim()).filter(Boolean));
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`OLLAMA_API_KEY_${i}`]?.trim();
    if (k) out.push(k);
  }
  return [...new Set(out)];
}

const KEYS = loadKeys();
let cursor = 0;

export function agentEnabled(): boolean {
  return KEYS.length > 0;
}

export function keyCount(): number {
  return KEYS.length;
}

/** Next key, round-robin. Returns null when the agent is dormant (no keys set), which
 *  is how the whole feature stays off until a key exists — same pattern as the
 *  registry address gating the anchor UI. */
export function nextKey(): string | null {
  if (KEYS.length === 0) return null;
  const key = KEYS[cursor % KEYS.length];
  cursor = (cursor + 1) % KEYS.length;
  return key;
}

/** Move past a key that just failed, so a single dead account doesn't serve every
 *  other request. */
export function rotateAfterFailure(): void {
  if (KEYS.length > 0) cursor = (cursor + 1) % KEYS.length;
}

// ---------------------------------------------------------------- rate limiting

interface Window {
  hits: number[]; // ms timestamps, newest last
  day: { count: number; startedAt: number };
}

const buckets = new Map<string, Window>();

/** Per-identity limits. Deliberately generous for a connected wallet and tight for a
 *  bare IP, since an address is at least a weak identity and an IP is not. */
export const LIMITS = {
  perMinute: 6,
  perDay: 120,
  /** Hard ceiling across every caller, so many IPs spreading thinly still can't
   *  spend the plans. */
  globalPerDay: 2_000,
} as const;

const MINUTE = 60_000;
const DAY = 86_400_000;

let globalDay = { count: 0, startedAt: Date.now() };

export interface LimitVerdict {
  ok: boolean;
  /** Set when ok is false — safe to show the user. */
  reason?: string;
  /** Seconds to wait, for a Retry-After header. */
  retryAfter?: number;
}

/**
 * Check and consume one unit of budget for `identity` (a lowercased wallet address
 * when we have one, otherwise `ip:<addr>`).
 *
 * Consumes on success only, so a rejected request doesn't also burn budget.
 */
export function consume(identity: string): LimitVerdict {
  const now = Date.now();

  if (now - globalDay.startedAt > DAY) globalDay = { count: 0, startedAt: now };
  if (globalDay.count >= LIMITS.globalPerDay) {
    return {
      ok: false,
      reason: "The assistant has hit today's overall usage cap. Try again tomorrow.",
      retryAfter: Math.ceil((globalDay.startedAt + DAY - now) / 1000),
    };
  }

  let w = buckets.get(identity);
  if (!w) {
    w = { hits: [], day: { count: 0, startedAt: now } };
    buckets.set(identity, w);
  }

  if (now - w.day.startedAt > DAY) w.day = { count: 0, startedAt: now };
  if (w.day.count >= LIMITS.perDay) {
    return {
      ok: false,
      reason: "You've reached today's limit for the assistant.",
      retryAfter: Math.ceil((w.day.startedAt + DAY - now) / 1000),
    };
  }

  w.hits = w.hits.filter((t) => now - t < MINUTE);
  if (w.hits.length >= LIMITS.perMinute) {
    const oldest = w.hits[0];
    return {
      ok: false,
      reason: "Slow down a moment.",
      retryAfter: Math.max(1, Math.ceil((oldest + MINUTE - now) / 1000)),
    };
  }

  w.hits.push(now);
  w.day.count += 1;
  globalDay.count += 1;

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) {
      if (now - v.day.startedAt > DAY) buckets.delete(k);
      if (buckets.size <= 4_000) break;
    }
  }

  return { ok: true };
}
