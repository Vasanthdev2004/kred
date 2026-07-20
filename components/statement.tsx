"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Download, Loader2 } from "lucide-react";
import { useIncome } from "@/hooks/use-income";
import { useTags } from "@/hooks/use-tags";
import { buildStatement, type TagLike } from "@/lib/statement";
import { formatAmount } from "@/lib/utils";
import { type TokenSymbol } from "@/lib/tokens";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TokenBadge } from "@/components/token-badge";
import { StatementChart } from "@/components/statement-chart";

const ym = (ts: number) => new Date(ts).toISOString().slice(0, 7);

export function Statement() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = useIncome();
  const payments = data?.payments;
  const { data: tags } = useTags();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  const months = useMemo(() => {
    const s = new Set((payments ?? []).map((p) => ym(p.timestamp)));
    return [...s].sort();
  }, [payments]);
  const rangeFrom = from || months[0] || "";
  const rangeTo = to || months[months.length - 1] || "";

  const tagByTx = useMemo(() => {
    const m = new Map<string, TagLike>();
    for (const t of tags ?? []) m.set(t.txHash.toLowerCase(), t);
    return m;
  }, [tags]);

  const statement = useMemo(
    () => buildStatement(payments ?? [], tagByTx, rangeFrom, rangeTo),
    [payments, tagByTx, rangeFrom, rangeTo],
  );

  const tokens = Object.keys(statement.totals) as TokenSymbol[];
  const hasData = statement.txs.length > 0;

  async function download() {
    if (!address || !hasData) return;
    setDownloading(true);
    try {
      const { downloadStatementPdf } = await import("@/components/statement-pdf");
      await downloadStatementPdf({ statement, address });
    } finally {
      setDownloading(false);
    }
  }

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to generate an income statement.
        </p>
        <ConnectButton />
      </Card>
    );
  }

  const nowYm = new Date().toISOString().slice(0, 7);
  const monthsAgo = (n: number) => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7);
  };
  const presets: { label: string; from: string; to: string }[] = [
    { label: "This month", from: nowYm, to: nowYm },
    { label: "Last 3 months", from: monthsAgo(2), to: nowYm },
    { label: "This year", from: `${nowYm.slice(0, 4)}-01`, to: nowYm },
    { label: "All time", from: months[0] ?? nowYm, to: nowYm },
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = rangeFrom === p.from && rangeTo === p.to;
            return (
              <Button
                key={p.label}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={active ? "" : "text-muted-foreground"}
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-3">
            <div>
              <Label>From</Label>
              <Input type="month" value={rangeFrom} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="month" value={rangeTo} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button onClick={download} disabled={!hasData || downloading} className="gap-1.5">
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {downloading ? "Building PDF…" : "Export PDF"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Card className="h-64 animate-pulse bg-muted/30" />
      ) : !hasData ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No income in this period.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tokens.map((sym) => {
              const t = statement.totals[sym]!;
              return (
                <Card key={sym} className="hairline-top relative overflow-hidden p-5">
                  <div className="flex items-center gap-2">
                    <TokenBadge symbol={sym} size="sm" />
                    <span className="text-sm text-muted-foreground">Total {sym}</span>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-semibold nums">
                    {formatAmount(t.amount, t.decimals)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.count} payment{t.count === 1 ? "" : "s"}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Monthly income</h2>
            <StatementChart data={statement.byMonth} tokens={tokens} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="By client" rows={statement.byClient} />
            <BreakdownCard title="By category" rows={statement.byCategory} capitalize />
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  capitalize,
}: {
  title: string;
  rows: { name: string; USDC: number; EURC: number; count: number }[];
  capitalize?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 text-sm font-semibold">
        {title}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-border/60 last:border-0">
                <td className={`px-5 py-2.5 ${capitalize ? "capitalize" : ""}`}>
                  {r.name}
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-xs nums">
                  {r.USDC ? `${r.USDC.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC` : ""}
                  {r.USDC && r.EURC ? " · " : ""}
                  {r.EURC ? `${r.EURC.toLocaleString("en-US", { maximumFractionDigits: 2 })} EURC` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
