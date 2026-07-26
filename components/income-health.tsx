"use client";

import { useMemo, type ReactNode } from "react";
import { Activity } from "lucide-react";
import { type Payment } from "@/lib/indexer";
import { buildStatement, type Statement, type TagLike } from "@/lib/statement";
import { buildIncomeHealth, type TokenHealth } from "@/lib/stability";
import { type TokenSymbol } from "@/lib/tokens";
import { cn, formatAmount, shorten } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { TokenBadge } from "@/components/token-badge";

/** One label per figure, shared with the unavailable state so the two can't drift. */
const STAT = {
  monthsActive: "Months active",
  average: "Avg monthly",
  volatility: "Volatility",
  streak: "Longest streak",
  topClient: "Top client share",
} as const;

/** Shown instead of a number whenever a read failed or produced nothing. Never "0":
 *  "0" is a claim about the income, "—" is an admission about the data. */
const NONE = "—";

const TOKEN_GLOW: Record<TokenSymbol, string> = {
  USDC: "rgba(39,117,202,0.45)",
  EURC: "rgba(55,195,155,0.45)",
};

export interface IncomeHealthProps {
  /** A prebuilt statement, e.g. the range-filtered one on /statement. Wins over `payments`. */
  statement?: Statement;
  /** Or the raw income read, and the panel builds an all-time statement itself. */
  payments?: Payment[];
  /** Manual tags (useTags), only used alongside `payments`. */
  tags?: (TagLike & { txHash: string })[];
  /** The income read is still in flight. */
  isLoading?: boolean;
  /** The income read failed. Every figure renders as "—". */
  isError?: boolean;
  className?: string;
}

/**
 * Income Health: the descriptive stats a reader of an income statement actually looks
 * at, per token, computed in lib/stability from payments already indexed from Arc.
 *
 * Deliberately not a score. There is no verdict, no rating, no threshold and no colour
 * coding that would imply one — just the figures and the window they describe.
 */
export function IncomeHealth({
  statement,
  payments,
  tags,
  isLoading,
  isError,
  className,
}: IncomeHealthProps) {
  const source = useMemo(() => {
    if (statement) return statement;
    if (!payments) return undefined;
    const tagByTx = new Map<string, TagLike>();
    for (const t of tags ?? []) tagByTx.set(t.txHash.toLowerCase(), t);
    // Empty range = all time: buildStatement leaves byMonth empty and buildIncomeHealth
    // derives the window from the payments themselves.
    return buildStatement(payments, tagByTx, "", "");
  }, [statement, payments, tags]);

  const health = useMemo(() => (source ? buildIncomeHealth(source) : null), [source]);

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Activity className="size-4" />
          Income health
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Descriptive statistics from your on-chain payments. Not a score, a rating, or
          a lending decision.
        </p>
      </div>

      {isLoading ? (
        <HealthSkeleton />
      ) : isError ? (
        <Unavailable
          title="Couldn't read your income from Arc."
          body="The chain is fine, this is just the read path. Nothing is shown as 0 while a read is failing."
        />
      ) : !health || health.tokens.length === 0 ? (
        <Unavailable
          title="Nothing to describe yet."
          body="These figures appear once this wallet has received USDC or EURC on Arc."
        />
      ) : (
        <>
          {health.tokens.map((symbol) => (
            <TokenPanel key={symbol} health={health.byToken[symbol]!} />
          ))}
          {health.tokens.length > 1 && (
            <p className="text-xs text-muted-foreground">
              USDC and EURC are described separately. Kred never converts between them,
              so no figure here mixes the two.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** "2026-01" -> "Jan 2026". UTC, to match the month keys buildStatement bucketed by. */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The window the figures describe, spelled out so the denominators are never implied. */
function windowLabel(months: string[]): string {
  if (months.length === 0) return NONE;
  const first = monthLabel(months[0]);
  const last = monthLabel(months[months.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function TokenPanel({ health: h }: { health: TokenHealth }) {
  const top = h.topPayer;
  return (
    <GlassCard interactive glow={TOKEN_GLOW[h.symbol]} className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TokenBadge
            symbol={h.symbol}
            size="sm"
            className="transition-transform duration-300 group-hover:scale-110"
          />
          <span className="text-sm font-semibold">{h.symbol}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {plural(h.paymentCount, "payment")} · {windowLabel(h.months)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label={STAT.monthsActive}
          value={h.monthsInWindow > 0 ? String(h.monthsActive) : NONE}
          hint={h.monthsInWindow > 0 ? `of ${h.monthsInWindow} in range` : undefined}
        />
        <Stat
          label={STAT.average}
          value={
            h.averageMonthly === null ? (
              NONE
            ) : (
              <>
                {formatAmount(h.averageMonthly, h.decimals)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {h.symbol}
                </span>
              </>
            )
          }
          hint={
            h.monthsInWindow > 0
              ? `over ${plural(h.monthsInWindow, "month")}`
              : undefined
          }
        />
        <Stat
          label={STAT.volatility}
          value={h.volatility === null ? null : pct(h.volatility)}
          hint="std dev ÷ mean"
        />
        <Stat
          label={STAT.streak}
          value={h.longestStreak === null ? null : String(h.longestStreak)}
          hint="consecutive months"
        />
        <Stat
          label={STAT.topClient}
          value={top ? pct(top.share) : NONE}
          hint={top ? (top.isAddress ? shorten(top.name) : top.name) : undefined}
          mono={Boolean(top?.isAddress)}
        />
      </div>
    </GlassCard>
  );
}

/**
 * One figure. `value: null` means the data can't support it yet, which reads as
 * "Not enough history" rather than a number nobody should rely on.
 */
function Stat({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: ReactNode | null;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex min-h-7 min-w-0 items-baseline">
        {value === null ? (
          <span className="text-xs leading-tight text-muted-foreground/80">
            Not enough history
          </span>
        ) : (
          // truncate + min-w-0: a six-figure total must clip inside its own
          // cell rather than overrun the next stat.
          <span className="min-w-0 truncate font-mono text-lg font-semibold nums">
            {value}
          </span>
        )}
      </div>
      {value !== null && hint && (
        <div
          className={cn(
            "truncate text-xs text-muted-foreground",
            mono && "font-mono",
          )}
          title={hint}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/** Failed or empty read: the labels stay, every figure is "—". */
function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <GlassCard className="p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Object.values(STAT).map((label) => (
          <Stat key={label} label={label} value={NONE} />
        ))}
      </div>
      <div className="mt-5 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>
    </GlassCard>
  );
}

function HealthSkeleton() {
  return (
    <Card className="p-5">
      <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
            <div className="h-6 w-16 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
    </Card>
  );
}
