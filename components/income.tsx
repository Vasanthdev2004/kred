"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ExternalLink,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { useIncome } from "@/hooks/use-income";
import { useTags, type TagRecord } from "@/hooks/use-tags";
import { type Payment } from "@/lib/indexer";
import { type KredMemo } from "@/lib/memo";
import { type TokenSymbol } from "@/lib/tokens";
import { ARC, explorerAddress, explorerTx } from "@/config/arc";
import { cn, formatAmount, shorten, smartDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TokenBadge } from "@/components/token-badge";
import { TagDialog, type TagDraft } from "@/components/tag-dialog";

type MemoSource = "chain" | "tag" | "none";
type Row = Payment & {
  displayMemo: KredMemo | null;
  memoSource: MemoSource;
  tag?: TagRecord;
};

function tagToMemo(t: TagRecord): KredMemo {
  return {
    client: t.client ?? undefined,
    project: t.project ?? undefined,
    category: t.category ?? undefined,
    invoice: t.invoice ?? undefined,
    period: t.period ?? undefined,
    note: t.note ?? undefined,
  };
}

function summarize(rows: Row[]) {
  const totals = new Map<
    TokenSymbol,
    { symbol: TokenSymbol; decimals: number; amount: bigint; count: number }
  >();
  let tagged = 0;
  for (const p of rows) {
    if (p.displayMemo) tagged++;
    const t = totals.get(p.tokenSymbol) ?? {
      symbol: p.tokenSymbol,
      decimals: p.tokenDecimals,
      amount: 0n,
      count: 0,
    };
    t.amount += p.amount;
    t.count += 1;
    totals.set(p.tokenSymbol, t);
  }
  return {
    totals: [...totals.values()],
    count: rows.length,
    taggedPct: rows.length ? Math.round((tagged / rows.length) * 100) : 0,
  };
}

export function IncomeSection() {
  const { data, isLoading, isError, isFetching, refetch } = useIncome();
  const payments = data?.payments;
  const truncated = data?.truncated;
  const { data: tags } = useTags();
  const [dialog, setDialog] = useState<{ txHash: string; initial?: TagDraft } | null>(
    null,
  );

  const rows = useMemo<Row[]>(() => {
    const tagMap = new Map<string, TagRecord>();
    for (const t of tags ?? []) tagMap.set(t.txHash.toLowerCase(), t);
    return (payments ?? []).map((p) => {
      const tag = tagMap.get(p.txHash.toLowerCase());
      const displayMemo = p.memo ?? (tag ? tagToMemo(tag) : null);
      const memoSource: MemoSource = p.memo ? "chain" : tag ? "tag" : "none";
      return { ...p, displayMemo, memoSource, tag };
    });
  }, [payments, tags]);

  function openTag(row: Row) {
    setDialog({
      txHash: row.txHash,
      initial: row.tag
        ? {
            client: row.tag.client,
            project: row.tag.project,
            category: row.tag.category,
            invoice: row.tag.invoice,
            period: row.tag.period,
            note: row.tag.note,
          }
        : undefined,
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your income
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Syncing…" : "Refresh"}
        </Button>
      </div>

      {isLoading ? (
        <IncomeSkeleton />
      ) : isError ? (
        <IncomeError onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <IncomeEmpty />
      ) : (
        <>
          {truncated && (
            <div className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
              Showing your most recent {rows.length.toLocaleString()} payments — older
              history is truncated and not counted in these totals.
            </div>
          )}
          <IncomeSummary rows={rows} />
          <IncomeTable rows={rows} onTag={openTag} />
        </>
      )}

      {dialog && (
        <TagDialog
          key={dialog.txHash}
          open
          onClose={() => setDialog(null)}
          txHash={dialog.txHash}
          initial={dialog.initial}
        />
      )}
    </section>
  );
}

/** Last 8 calendar months of income for a token, as relative bar heights. */
function sparkline(rows: Row[], symbol: TokenSymbol): number[] {
  const buckets = new Map<string, number>();
  const now = new Date();
  const keys: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const k = d.toISOString().slice(0, 7);
    keys.push(k);
    buckets.set(k, 0);
  }
  for (const r of rows) {
    if (r.tokenSymbol !== symbol) continue;
    const k = new Date(r.timestamp).toISOString().slice(0, 7);
    if (buckets.has(k)) {
      buckets.set(k, buckets.get(k)! + Number(r.amount / 10_000n) / 100);
    }
  }
  return keys.map((k) => buckets.get(k)!);
}

const GLASS =
  "group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 p-5 shadow-md backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-xl";

/** Thin light seam along the top edge — the glass "sheen". */
function CardSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
    />
  );
}

const TOKEN_GLOW: Record<TokenSymbol, string> = {
  USDC: "rgba(39,117,202,0.45)",
  EURC: "rgba(55,195,155,0.45)",
};

function IncomeSummary({ rows }: { rows: Row[] }) {
  const { totals, count, taggedPct } = summarize(rows);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {totals.map((t) => {
        const spark = sparkline(rows, t.symbol);
        const max = Math.max(...spark, 1);
        return (
          <div key={t.symbol} className={GLASS}>
            <CardSheen />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
              style={{
                background: `radial-gradient(circle, ${TOKEN_GLOW[t.symbol]} 0%, transparent 70%)`,
              }}
            />
            <div className="relative flex items-center gap-2">
              <TokenBadge
                symbol={t.symbol}
                className="size-6 transition-transform duration-300 group-hover:scale-110"
              />
              <span className="text-sm text-muted-foreground">
                Total {t.symbol}
              </span>
            </div>
            <div className="relative mt-3 font-mono text-2xl font-semibold nums">
              {formatAmount(t.amount, t.decimals)}
            </div>
            <div className="relative mt-1 text-xs text-muted-foreground">
              across {t.count} payment{t.count === 1 ? "" : "s"}
            </div>
            <div
              aria-hidden
              className="absolute bottom-0 right-4 flex h-8 items-end gap-[3px] opacity-50 transition-opacity duration-300 group-hover:opacity-90"
            >
              {spark.map((v, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-t-sm bg-gradient-to-t from-brand/20 to-brand/70"
                  style={{ height: `${Math.max((v / max) * 100, 6)}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className={GLASS}>
        <CardSheen />
        <div className="relative flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-primary">
            <ArrowDownLeft className="size-3.5" />
          </span>
          <span className="text-sm text-muted-foreground">Payments</span>
        </div>
        <div className="relative mt-3 font-mono text-2xl font-semibold nums">
          {count}
        </div>
        <div className="relative mt-1 text-xs text-muted-foreground">
          incoming, on-chain
        </div>
      </div>

      <div className={GLASS}>
        <CardSheen />
        <div className="relative flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-primary">
            <Tag className="size-3.5" />
          </span>
          <span className="text-sm text-muted-foreground">Categorized</span>
        </div>
        <div className="relative mt-3 font-mono text-2xl font-semibold nums">
          {taggedPct}%
        </div>
        <div className="relative mt-1 text-xs text-muted-foreground">
          memo + manual tags
        </div>
      </div>
    </div>
  );
}

const MAX_ROWS = 100;

function IncomeTable({ rows, onTag }: { rows: Row[]; onTag: (r: Row) => void }) {
  const shown = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - shown.length;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">From</th>
              <th className="px-5 py-3 font-medium">Memo / tag</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Tx</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr
                key={`${p.txHash}-${i}`}
                className="border-b border-border/60 last:border-0 hover:bg-secondary/40"
              >
                <td
                  className="whitespace-nowrap px-5 py-3 text-muted-foreground"
                  title={new Date(p.timestamp).toLocaleString()}
                >
                  {smartDate(p.timestamp)}
                </td>
                <td className="px-5 py-3">
                  <a
                    href={explorerAddress(p.from)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary"
                  >
                    <ArrowDownLeft className="size-3.5 text-primary" />
                    {shorten(p.from)}
                  </a>
                </td>
                <td className="px-5 py-3">
                  <MemoCell row={p} onTag={onTag} />
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5 font-mono font-medium nums">
                    {formatAmount(p.amount, p.tokenDecimals)}
                    <TokenBadge symbol={p.tokenSymbol} size="sm" />
                  </span>
                </td>
                <td className="px-5 py-3">
                  <a
                    href={explorerTx(p.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-primary"
                    aria-label="View on explorer"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <div className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
          Showing the {MAX_ROWS} most recent · {hidden.toLocaleString()} more counted
          in totals
        </div>
      )}
    </Card>
  );
}

function MemoCell({ row, onTag }: { row: Row; onTag: (r: Row) => void }) {
  const m = row.displayMemo;
  if (!m) {
    return (
      <button
        onClick={() => onTag(row)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Plus className="size-3" />
        Tag
      </button>
    );
  }
  return (
    <div className="group flex flex-wrap items-center gap-1.5">
      {m.client && <span className="font-medium">{m.client}</span>}
      {m.project && (
        <span className="text-xs text-muted-foreground">· {m.project}</span>
      )}
      {m.category && (
        <Badge variant="success" className="font-normal capitalize">
          {m.category}
        </Badge>
      )}
      {m.invoice && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {m.invoice}
        </span>
      )}
      {row.memoSource === "chain" ? (
        <Badge variant="muted" className="font-normal text-[10px] uppercase">
          on-chain
        </Badge>
      ) : (
        <button
          onClick={() => onTag(row)}
          aria-label="Edit tag"
          className="text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  );
}

function IncomeSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-[104px] animate-pulse bg-muted/40" />
        ))}
      </div>
      <Card className="divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function IncomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <TriangleAlert className="size-6 text-destructive" />
      <p className="font-medium">Couldn&apos;t read your income from Arc.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        The explorer or RPC may be busy. The chain is fine — this is just the read
        path.
      </p>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

function IncomeEmpty() {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <p className="font-medium">No incoming payments yet.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Once this wallet receives USDC or EURC on Arc, every payment shows up here —
        auto-categorized from its Transaction Memo.
      </p>
      <a
        href={ARC.faucetUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        Get test USDC/EURC from the Circle faucet
        <ExternalLink className="size-3.5" />
      </a>
    </Card>
  );
}
