import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const SPARK = [34, 41, 38, 52, 47, 63, 58, 72];

/**
 * The signature "Verified Income Passport" card — a tangible picture of the product's
 * promise. Ships with illustrative sample data on the hero; the /verify route (F5)
 * renders the same component with real, chain-recomputed figures.
 */
export function PassportCard({
  className,
  total = "$48,250.00",
  period = "Q1 2026",
  clients = 4,
  payments = 17,
  hashes = ["0x9f2c…a41d", "0x1b77…c0e9", "0x4ad0…7f52"],
}: {
  className?: string;
  total?: string;
  period?: string;
  clients?: number;
  payments?: number;
  hashes?: string[];
}) {
  const max = Math.max(...SPARK);
  return (
    <div
      className={cn(
        "gradient-border hairline-top relative overflow-hidden rounded-xl bg-card/80 p-6 shadow-glow backdrop-blur-xl",
        className,
      )}
    >
      {/* inner ambient wash */}
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/20 blur-3xl" />

      {/* header */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Income Proof
          </span>
        </div>
        <div className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-brand/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
          <ShieldCheck className="size-3.5" />
          Verified on Arc
          {/* shimmer sweep */}
          <span className="pointer-events-none absolute inset-0 -skew-x-12">
            <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </span>
        </div>
      </div>

      {/* amount */}
      <div className="relative mt-6">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Verified income · {period}
        </div>
        <div className="mt-1 font-mono text-4xl font-semibold tracking-tight nums">
          {total}
        </div>
      </div>

      {/* sparkline */}
      <div className="relative mt-5 flex h-14 items-end gap-1.5">
        {SPARK.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-gradient-to-t from-brand/30 to-brand"
            style={{ height: `${(v / max) * 100}%` }}
          />
        ))}
      </div>

      {/* meta row */}
      <div className="relative mt-5 flex items-center gap-4 text-sm">
        <div>
          <div className="font-semibold nums">{payments}</div>
          <div className="text-xs text-muted-foreground">payments</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="font-semibold nums">{clients}</div>
          <div className="text-xs text-muted-foreground">clients</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="font-semibold nums">100%</div>
          <div className="text-xs text-muted-foreground">on-chain</div>
        </div>
      </div>

      {/* tx hashes */}
      <div className="relative mt-5 border-t border-border pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Backed by transactions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hashes.map((h) => (
            <span
              key={h}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 font-mono text-[11px] text-muted-foreground"
            >
              {h}
              <ArrowUpRight className="size-3" />
            </span>
          ))}
          <span className="inline-flex items-center rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
            +14
          </span>
        </div>
      </div>

      {/* footer */}
      <div className="relative mt-4 flex items-center gap-2">
        <Logo className="text-xs opacity-70" />
        <span className="ml-auto text-[11px] text-muted-foreground">
          Recomputed from Arc, not our database
        </span>
      </div>
    </div>
  );
}
