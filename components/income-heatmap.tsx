"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { CalendarRange, Inbox, TriangleAlert } from "lucide-react";
import { type Payment } from "@/lib/indexer";
import { type TokenSymbol } from "@/lib/tokens";
import { cn, formatAmount } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Sequential ramp — ONE hue (the Kred brand green), stepped light→dark, so shade
 * reads as magnitude and never as identity. Each mode is its own selection rather
 * than a flip of the other; both pass the dataviz ordinal checks (monotone L,
 * adjacent ΔL ≥ 0.06, lightest step ≥ 2:1 on its own surface, single hue).
 * Index 0 is a neutral off-hue gray on purpose: "no income" must never be mistaken
 * for "a little income" (ΔE 15.3 protan light / 17.9 deutan dark vs level 1).
 */
const RAMP: Record<"light" | "dark", readonly string[]> = {
  light: ["#e3e7ee", "#4dc79a", "#2ab280", "#189164", "#0b6b47"],
  dark: ["#21262c", "#246048", "#298e66", "#2ac687", "#53eaa8"],
};

const CELL = 11; // px — cell edge
const WEEKS = 53; // columns: a full trailing year plus the current partial week
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LABELLED_ROWS = new Set([1, 3, 5]); // Mon/Wed/Fri only — the rest would collide
const TOKEN_ORDER: TokenSymbol[] = ["USDC", "EURC"]; // stable tooltip ordering

type Level = 0 | 1 | 2 | 3 | 4;

interface TokenDay {
  amount: bigint; // base units — exact, never floated
  decimals: number;
  count: number;
}
type DayTotals = Map<TokenSymbol, TokenDay>;

/** Local calendar day key, matching the local dates the income table prints. */
function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 53 columns of 7 days, ending on the Saturday of the current week. */
function buildWeeks(today: Date): Date[][] {
  const lastSat = new Date(today);
  lastSat.setDate(lastSat.getDate() + (6 - lastSat.getDay()));
  const firstSun = new Date(lastSat);
  firstSun.setDate(firstSun.getDate() - (WEEKS * 7 - 1));

  const weeks: Date[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(firstSun);
      cur.setDate(firstSun.getDate() + w * 7 + d);
      col.push(cur);
    }
    weeks.push(col);
  }
  return weeks;
}

/** A short month name over the first column of each month, thinned so labels never
 *  collide, and never on the final stub column where the text would be clipped. */
function monthLabels(weeks: Date[][]): (string | null)[] {
  const out: (string | null)[] = [];
  let lastMonth = -1;
  let lastLabelAt = -99;
  weeks.forEach((col, i) => {
    const month = col[0].getMonth();
    if (month !== lastMonth && i - lastLabelAt >= 3 && i < weeks.length - 1) {
      out.push(col[0].toLocaleDateString("en-US", { month: "short" }));
      lastLabelAt = i;
    } else {
      out.push(null);
    }
    lastMonth = month;
  });
  return out;
}

/**
 * Rank a day inside its OWN token's distribution of earning days. USDC and EURC are
 * never summed — there is no FX rate in this app — so a cell takes the highest level
 * any single token reached that day, and the tooltip prints both figures separately.
 */
function levelScaleFor(dailyTotals: bigint[]): (v: bigint) => Level {
  const sorted = [...dailyTotals].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;
  if (n === 0) return () => 0;
  // One earning day, or every day the same size: a single mid shade is honest — a
  // full light→dark spread would invent variation that isn't in the data.
  if (sorted[0] === sorted[n - 1]) return () => 3;
  return (v) => {
    // Lower bound, so identical amounts always land on the same level.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    const t = lo / (n - 1); // rank position 0..1 — index math, not amount math
    return t >= 0.85 ? 4 : t >= 0.6 ? 3 : t >= 0.3 ? 2 : 1;
  };
}

/** Consecutive weeks with at least one payment — the "streak" the grid is named for. */
function longestWeekStreak(weeks: Date[][], byDay: Map<string, DayTotals>): number {
  let best = 0;
  let run = 0;
  for (const col of weeks) {
    run = col.some((d) => byDay.has(dayKey(d))) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** "1,250 USDC · 2 payments" per token, in a fixed order, never combined. */
function dayLines(totals: DayTotals): string[] {
  const lines: string[] = [];
  for (const symbol of TOKEN_ORDER) {
    const t = totals.get(symbol);
    if (!t) continue;
    lines.push(
      `${formatAmount(t.amount, t.decimals)} ${symbol} · ${t.count} payment${
        t.count === 1 ? "" : "s"
      }`,
    );
  }
  return lines;
}

const longDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export interface IncomeHeatmapProps {
  /** The income read (useIncome), already loaded. */
  payments?: Payment[];
  /** The income read is still in flight. */
  isLoading?: boolean;
  /** The income read failed. The grid is withheld rather than drawn as empty days. */
  isError?: boolean;
  className?: string;
}

/**
 * A year of earning days as a GitHub-contributions-style grid: weeks are columns,
 * days are rows, shade is that day's income volume. Pure presentation over payments
 * the caller already loaded — no network calls, no chain reads.
 *
 * A failed read never renders as a year of blank cells: a full grid of "nothing
 * happened" is a claim about the income, and only the data can make it.
 */
export function IncomeHeatmap({
  payments,
  isLoading,
  isError,
  className,
}: IncomeHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Midnight today, resolved once per mount so every cell shares one "now".
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weeks = useMemo(() => buildWeeks(today), [today]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);

  const { byDay, levelOf, earningDays, streak } = useMemo(() => {
    const byDay = new Map<string, DayTotals>();
    const windowStart = weeks[0][0].getTime();
    // End of today, not midnight — otherwise every payment received so far today
    // falls outside the window and the newest cell reads as a blank day.
    const windowEnd = new Date(today).setHours(23, 59, 59, 999);

    for (const p of payments ?? []) {
      const when = new Date(p.timestamp);
      const t0 = when.getTime();
      if (t0 < windowStart || t0 > windowEnd) continue; // outside the grid
      const key = dayKey(when);
      const day = byDay.get(key) ?? new Map<TokenSymbol, TokenDay>();
      const t = day.get(p.tokenSymbol) ?? {
        amount: 0n,
        decimals: p.tokenDecimals,
        count: 0,
      };
      t.amount += p.amount;
      t.count += 1;
      day.set(p.tokenSymbol, t);
      byDay.set(key, day);
    }

    // One scale per token, over that token's own earning days.
    const scales = new Map<TokenSymbol, (v: bigint) => Level>();
    for (const symbol of TOKEN_ORDER) {
      const totals: bigint[] = [];
      for (const day of byDay.values()) {
        const t = day.get(symbol);
        if (t) totals.push(t.amount);
      }
      scales.set(symbol, levelScaleFor(totals));
    }

    const levelOf = (day: DayTotals | undefined): Level => {
      if (!day) return 0;
      let level: Level = 0;
      for (const symbol of TOKEN_ORDER) {
        const t = day.get(symbol);
        if (!t) continue;
        const l = scales.get(symbol)!(t.amount);
        if (l > level) level = l;
      }
      return level;
    };

    return {
      byDay,
      levelOf,
      earningDays: byDay.size,
      streak: longestWeekStreak(weeks, byDay),
    };
  }, [payments, weeks, today]);

  // Open on the most recent week — that's the end of the story people look for.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [mounted]);

  const dark = resolvedTheme === "dark";
  const ramp = dark ? RAMP.dark : RAMP.light;
  // Hairline inner edge so each tile reads as a tile on both surfaces.
  const edge = dark ? "rgba(255,255,255,0.05)" : "rgba(16,24,32,0.06)";

  const unavailable = Boolean(isError) || !payments;
  const empty = !unavailable && earningDays === 0;
  const showGrid = !isLoading && !unavailable && !empty;

  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarRange className="size-4 text-primary" />
            Income streak
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The last 12 months of earning days. USDC and EURC are counted
            separately, never converted.
          </p>
        </div>
        {showGrid && (
          <div className="flex gap-5 text-right">
            <div>
              <div className="font-mono text-lg font-semibold leading-none nums">
                {earningDays}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                earning day{earningDays === 1 ? "" : "s"}
              </div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold leading-none nums">
                {streak}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                week streak
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <HeatmapSkeleton />
      ) : unavailable ? (
        <HeatmapNotice
          icon={<TriangleAlert className="size-5 text-destructive" />}
          title="Couldn't read your income from Arc."
          body="The chain is fine, this is just the read path. No day is drawn as
            empty while a read is failing."
        />
      ) : empty ? (
        <HeatmapNotice
          icon={<Inbox className="size-5 text-muted-foreground" />}
          title="No earning days in the last 12 months."
          body="Every USDC or EURC payment this wallet receives on Arc lights up the
            day it arrived."
        />
      ) : (
        <>
          {/* Fixed-size cells: on a narrow screen the grid scrolls inside this
              container rather than squashing tiles or stretching the page. */}
          <div ref={scroller} className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
            <div className="flex w-max gap-[3px]">
              {/* Weekday gutter — offset by the month-label row above the grid. */}
              <div
                aria-hidden
                className="flex flex-col gap-[2px] pt-[18px] pr-0.5 text-[10px] text-muted-foreground"
              >
                {WEEKDAYS.map((d, i) => (
                  <span
                    key={d}
                    className="flex items-center"
                    style={{ height: CELL }}
                  >
                    {LABELLED_ROWS.has(i) ? d : ""}
                  </span>
                ))}
              </div>

              <div>
                <div aria-hidden className="flex h-[18px] gap-[2px]">
                  {labels.map((label, i) => (
                    <div
                      key={i}
                      className="relative shrink-0"
                      style={{ width: CELL }}
                    >
                      {label && (
                        <span className="absolute left-0 top-0 whitespace-nowrap text-[10px] leading-none text-muted-foreground">
                          {label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Suppress the grid until the theme resolves — a light ramp
                    flashing on a dark surface is worse than a beat of nothing. */}
                {mounted ? (
                  <TooltipProvider delayDuration={80} skipDelayDuration={300}>
                    <div className="flex gap-[2px]">
                      {weeks.map((col, w) => (
                        <div key={w} className="flex flex-col gap-[2px]">
                          {col.map((date) => {
                            const future = date > today;
                            const key = dayKey(date);
                            const totals = byDay.get(key);
                            return (
                              <DayCell
                                key={key}
                                date={date}
                                totals={future ? undefined : totals}
                                level={future ? 0 : levelOf(totals)}
                                future={future}
                                ramp={ramp}
                                edge={edge}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </TooltipProvider>
                ) : (
                  <div style={{ height: CELL * 7 + 2 * 6 }} />
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span>Less</span>
            {ramp.map((color, i) => (
              <span
                key={i}
                aria-hidden
                className="block shrink-0 rounded-[3px]"
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: mounted ? color : "transparent",
                  boxShadow: `inset 0 0 0 1px ${edge}`,
                }}
              />
            ))}
            <span>More</span>
          </div>
        </>
      )}
    </GlassCard>
  );
}

function DayCell({
  date,
  totals,
  level,
  future,
  ramp,
  edge,
}: {
  date: Date;
  totals: DayTotals | undefined;
  level: Level;
  future: boolean;
  ramp: readonly string[];
  edge: string;
}) {
  // Days past today keep the column square without pretending to be empty days.
  if (future) {
    return (
      <span
        aria-hidden
        className="block shrink-0"
        style={{ width: CELL, height: CELL }}
      />
    );
  }

  const box = {
    width: CELL,
    height: CELL,
    backgroundColor: ramp[level],
    boxShadow: `inset 0 0 0 1px ${edge}`,
  };

  // Nothing arrived: no value to announce, so it stays out of the reading order and
  // carries a plain title for pointer users.
  if (!totals) {
    return (
      <span
        aria-hidden
        title={`No income on ${longDate(date)}`}
        className="block shrink-0 rounded-[3px]"
        style={box}
      />
    );
  }

  const lines = dayLines(totals);
  // The values live in the label, not in the shade — colour is never the only channel.
  const label = `${longDate(date)}: ${lines.join("; ")}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="block shrink-0 rounded-[3px] outline-none hover:outline hover:outline-1 hover:outline-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          style={box}
        />
      </TooltipTrigger>
      {/* Neutral popover surface rather than the default solid-primary tooltip: a
          green bubble beside a green ramp reads as another data value. */}
      <TooltipContent className="border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
        <div className="font-medium">{longDate(date)}</div>
        <div className="mt-1 space-y-0.5 font-mono nums">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** A stand-in with the shape of the grid and none of its claims. */
function HeatmapSkeleton() {
  return (
    <div className="mt-4 space-y-[2px]">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[3px] bg-muted/50"
          style={{ height: CELL }}
        />
      ))}
    </div>
  );
}

function HeatmapNotice({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
