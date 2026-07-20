"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useIncome } from "@/hooks/use-income";
import { type Payment } from "@/lib/indexer";
import { formatAmount } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TokenBadge } from "@/components/token-badge";

const ym = (ts: number) => new Date(ts).toISOString().slice(0, 7);

const FIELD_OPTIONS = [
  { key: "period", label: "Period", hint: "Show the date range", default: true },
  { key: "count", label: "Payment count", hint: "How many payments", default: true },
  { key: "clients", label: "Client count", hint: "Distinct clients (from memos)", default: false },
  { key: "wallet", label: "Wallet address", hint: "Reveal your address", default: false },
] as const;

export function ShareBuilder() {
  const { address, isConnected } = useAccount();
  const { data: payments, isLoading } = useIncome();

  const months = useMemo(() => {
    const set = new Set((payments ?? []).map((p) => ym(p.timestamp)));
    return [...set].sort();
  }, [payments]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fields, setFields] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FIELD_OPTIONS.map((f) => [f.key, f.default])),
  );
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // default the range to full history once income loads
  const rangeFrom = from || months[0] || "";
  const rangeTo = to || months[months.length - 1] || "";

  const included = useMemo<Payment[]>(() => {
    if (!rangeFrom || !rangeTo) return payments ?? [];
    return (payments ?? []).filter((p) => {
      const m = ym(p.timestamp);
      return m >= rangeFrom && m <= rangeTo;
    });
  }, [payments, rangeFrom, rangeTo]);

  const totals = useMemo(() => {
    const map = new Map<string, { amount: bigint; decimals: number; fiat: string }>();
    for (const p of included) {
      const t = map.get(p.tokenSymbol) ?? {
        amount: 0n,
        decimals: p.tokenDecimals,
        fiat: p.fiat,
      };
      t.amount += p.amount;
      map.set(p.tokenSymbol, t);
    }
    return [...map.entries()];
  }, [included]);

  async function create() {
    if (!address || included.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/disclosures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          periodStart: rangeFrom || "all",
          periodEnd: rangeTo || "all",
          fields: Object.keys(fields).filter((k) => fields[k]),
          txHashes: included.map((p) => p.txHash),
        }),
      });
      if (!res.ok) throw new Error("create failed");
      const { id } = (await res.json()) as { id: string };
      setResult(`${window.location.origin}/verify/${id}`);
    } catch {
      setError("Couldn't create the link. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to build a verifiable income link.
        </p>
        <ConnectButton />
      </Card>
    );
  }

  if (result) {
    return <ShareResult url={result} onReset={() => setResult(null)} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>From</Label>
            <Input
              type="month"
              value={rangeFrom}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="month"
              value={rangeTo}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reveal to the verifier
        </div>
        <div className="space-y-1">
          {FIELD_OPTIONS.map((f) => (
            <label
              key={f.key}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/50"
            >
              <input
                type="checkbox"
                checked={fields[f.key]}
                onChange={(e) =>
                  setFields((s) => ({ ...s, [f.key]: e.target.checked }))
                }
                className="size-4 accent-primary"
              />
              <span className="text-sm font-medium">{f.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{f.hint}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The total and the backing transactions are always shown — that&apos;s what
          makes the proof independently verifiable.
        </p>
      </Card>

      {/* preview */}
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Will disclose
        </div>
        <Card className="p-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading income…</p>
          ) : included.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments in this range.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {totals.map(([sym, t]) => (
                  <div key={sym} className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-semibold nums">
                      {formatAmount(t.amount, t.decimals)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <TokenBadge symbol={sym as "USDC" | "EURC"} size="sm" />
                      {sym}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {included.length} transaction{included.length === 1 ? "" : "s"} ·
                recomputed from Arc on the verify page
              </div>
            </>
          )}
          <Button
            className="mt-5 w-full"
            onClick={create}
            disabled={submitting || included.length === 0}
          >
            <ShieldCheck className="size-4" />
            {submitting ? "Creating…" : "Create verify link"}
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </Card>
      </div>
    </div>
  );
}

function ShareResult({ url, onReset }: { url: string; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Card className="gradient-border hairline-top relative overflow-hidden p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
        <ShieldCheck className="size-7 text-primary" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">Your verify link is ready</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Anyone who opens it sees your income recomputed live from Arc — no trust in
        you required.
      </p>
      <div className="mt-5 flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button variant="outline" onClick={copy} className="shrink-0 gap-1.5">
          {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          Open verify page <ExternalLink className="size-3.5" />
        </a>
        <button onClick={onReset} className="text-muted-foreground hover:underline">
          Create another
        </button>
      </div>
    </Card>
  );
}
