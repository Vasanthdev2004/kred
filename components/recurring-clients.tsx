"use client";

import { useMemo } from "react";
import { CalendarClock, Repeat, TriangleAlert, Users } from "lucide-react";
import { useIncome } from "@/hooks/use-income";
import { useTags } from "@/hooks/use-tags";
import { type TagLike } from "@/lib/statement";
import {
  detectRecurring,
  MIN_CYCLES,
  type ClientStream,
  type Confidence,
} from "@/lib/recurring";
import { cn, formatAmount, formatDate, shorten, smartDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TokenBadge } from "@/components/token-badge";

const TOKEN_GLOW: Record<string, string> = {
  USDC: "rgba(39,117,202,0.45)",
  EURC: "rgba(55,195,155,0.45)",
};

/** What the confidence signal means, spelled out on hover. Deliberately about the
 *  evidence behind the label, never about future income. */
const CONFIDENCE: Record<
  Confidence,
  { label: string; variant: BadgeProps["variant"]; hint: string }
> = {
  high: {
    label: "high",
    variant: "success",
    hint: "Six or more payments on a steady interval.",
  },
  medium: {
    label: "medium",
    variant: "secondary",
    hint: "Four or more payments, with some drift in the timing.",
  },
  low: {
    label: "low",
    variant: "muted",
    hint: `Only just past the ${MIN_CYCLES}-payment bar, or the timing varies.`,
  },
};

/**
 * Recurring-client panel: which clients pay on a monthly cadence, and what that adds
 * up to per token. Reads the same cached income/tag queries as the income feed, so
 * dropping it on a page costs no extra network.
 */
export function RecurringClients({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useIncome();
  const { data: tags } = useTags();

  const tagByTx = useMemo(() => {
    const m = new Map<string, TagLike>();
    for (const t of tags ?? []) m.set(t.txHash.toLowerCase(), t);
    return m;
  }, [tags]);

  const summary = useMemo(
    () => detectRecurring(data?.payments ?? [], tagByTx),
    [data?.payments, tagByTx],
  );

  const clientsWithPattern = new Set(
    summary.recurring.map((s) => s.key.split("|")[0]),
  ).size;
  const clientsTotal = new Set(summary.streams.map((s) => s.key.split("|")[0])).size;

  return (
    <section className={cn("space-y-5", className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recurring clients
        </h2>
        <span className="text-xs text-muted-foreground">
          Cadence measured from past payments
        </span>
      </div>

      {isLoading ? (
        <RecurringSkeleton />
      ) : isError ? (
        <RecurringError onRetry={() => refetch()} />
      ) : summary.recurring.length === 0 && summary.lapsed.length === 0 ? (
        <RecurringEmpty hasPayments={(data?.payments?.length ?? 0) > 0} />
      ) : (
        <>
          {data?.truncated && (
            <div className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
              Older history is truncated, so cadence is measured only over the
              payments loaded here. A long-running client may look newer than it is.
            </div>
          )}

          {summary.recurring.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {summary.mrr.map((t) => (
                  <GlassCard
                    key={t.symbol}
                    interactive
                    glow={TOKEN_GLOW[t.symbol]}
                    className="p-5"
                  >
                    <div className="flex items-center gap-2">
                      <TokenBadge symbol={t.symbol} size="sm" />
                      <span className="text-sm text-muted-foreground">
                        Recurring {t.symbol}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="font-mono text-2xl font-semibold nums">
                        {formatAmount(t.amount, t.decimals)}
                      </span>
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      across {t.clients} recurring client
                      {t.clients === 1 ? "" : "s"}
                    </div>
                  </GlassCard>
                ))}

                <GlassCard interactive className="p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-accent text-primary">
                      <Users className="size-3.5" />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      On a pattern
                    </span>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-semibold nums">
                    {clientsWithPattern}
                    <span className="text-base text-muted-foreground">
                      /{clientsTotal}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    clients paying you monthly
                  </div>
                </GlassCard>
              </div>

              <StreamTable streams={summary.recurring} />
            </>
          )}

          {summary.lapsed.length > 0 && <LapsedCard streams={summary.lapsed} />}

          <p className="text-xs leading-relaxed text-muted-foreground">
            A client is called recurring after {MIN_CYCLES} or more payments spaced
            roughly a month apart. Every figure above describes payments that already
            happened on Arc. Next dates are estimates from that past cadence, not a
            forecast of income, and no currency is converted into another.
          </p>
        </>
      )}
    </section>
  );
}

function StreamTable({ streams }: { streams: ClientStream[] }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Cadence</th>
              <th className="px-5 py-3 text-right font-medium">Typical</th>
              <th className="px-5 py-3 font-medium">Last paid</th>
              <th className="px-5 py-3 font-medium">Next (est.)</th>
              <th className="px-5 py-3 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => {
              const signal = CONFIDENCE[s.confidence];
              return (
                <tr
                  key={s.key}
                  className="border-b border-border/60 last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-5 py-3">
                    <div className={s.named ? "font-medium" : "font-mono text-xs"}>
                      {s.named ? s.label : shorten(s.label)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {s.count} payment{s.count === 1 ? "" : "s"} since{" "}
                      {formatDate(s.firstPaidAt)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {/* A failed or unmeasurable interval renders "—", never a number. */}
                    {s.medianIntervalDays === null
                      ? "—"
                      : `every ~${Math.round(s.medianIntervalDays)} days`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 font-mono font-medium nums">
                      {formatAmount(s.typicalAmount, s.decimals)}
                      <TokenBadge symbol={s.symbol} size="sm" />
                    </span>
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-muted-foreground"
                    title={new Date(s.lastPaidAt).toLocaleString()}
                  >
                    {smartDate(s.lastPaidAt)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      {s.nextExpectedAt === null
                        ? "—"
                        : formatDate(s.nextExpectedAt)}
                      {s.status === "due" && (
                        <Badge
                          variant="muted"
                          className="font-normal text-[10px] uppercase"
                          title="The estimated date has passed, but the client is still inside the usual window."
                        >
                          due
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={signal.variant}
                      className="font-normal"
                      title={signal.hint}
                    >
                      {signal.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <CalendarClock className="mr-1.5 inline size-3.5 align-[-2px]" />
        Next dates are estimates from each client&apos;s own past interval. They are
        not a promise of payment.
      </div>
    </GlassCard>
  );
}

/** Clients that were on a monthly cadence and have gone quiet past the grace window.
 *  Shown rather than dropped: a stream vanishing from the panel is worse than one
 *  that says why it no longer counts. */
function LapsedCard({ streams }: { streams: ClientStream[] }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 text-sm font-semibold">
        Paused
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          was recurring, nothing received since the expected date
        </span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {streams.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-2.5 text-sm last:border-0"
          >
            <span className={s.named ? "truncate" : "truncate font-mono text-xs"}>
              {s.named ? s.label : shorten(s.label)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              last paid {formatDate(s.lastPaidAt)} · {s.daysSinceLast} days ago
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function RecurringSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="h-[104px] animate-pulse bg-muted/40" />
        ))}
      </div>
      <Card className="divide-y divide-border/60">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function RecurringError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <TriangleAlert className="size-6 text-destructive" />
      <p className="font-medium">Couldn&apos;t read your payment history.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cadence is measured from your income feed, so there is nothing to measure
        until that loads.
      </p>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

function RecurringEmpty({ hasPayments }: { hasPayments: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
      <Repeat className="size-6 text-muted-foreground" />
      <p className="font-medium">No recurring pattern yet.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {hasPayments
          ? `A client shows up here once they have paid ${MIN_CYCLES} or more times, roughly a month apart. Tagging payments with a client name helps, since separate invoices from the same payer then count as one client.`
          : `Once this wallet has been paid ${MIN_CYCLES} or more times by the same client, roughly a month apart, the pattern shows up here.`}
      </p>
    </Card>
  );
}
