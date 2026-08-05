"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Hex } from "viem";
import { Anchor, Check, Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { listChallenge } from "@/lib/disclosure-auth";
import { explorerTx } from "@/config/arc";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet-button";
import { RevokeButton } from "@/components/revoke-button";

interface Row {
  id: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  fields: string[];
  txCount: number;
  digest: Hex;
  ownerHash: Hex;
  anchorTxHash: string | null;
  createdAt: string;
}

const FIELD_LABEL: Record<string, string> = {
  period: "Period",
  count: "Payment count",
  clients: "Client count",
  wallet: "Wallet address",
};

/**
 * Every verify link this wallet has minted.
 *
 * Until now a link could be created and never found again: revoke() was deployed and
 * only reachable if you still had the original URL — a contract function with no path
 * to it.
 *
 * Loading the list needs a signature rather than just an address. A verify link is
 * selectively disclosed, so an endpoint anyone could query by address would let a
 * stranger enumerate the links you sent to one specific landlord.
 */
export function DisclosuresList() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const ts = Date.now();
      const sig = await signMessageAsync({ message: listChallenge(address, ts) });
      const res = await fetch(
        `/api/disclosures/mine?address=${address}&ts=${ts}&sig=${sig}`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { disclosures: Row[] };
      setRows(j.disclosures);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "failed";
      toast.error(
        /reject|denied/i.test(msg) ? "Signature rejected" : `Couldn't load: ${msg}`,
      );
    } finally {
      setLoading(false);
    }
  }, [address, signMessageAsync]);

  const copy = (id: string) => {
    const url = `${window.location.origin}/verify/${id}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(id);
        toast.success("Verify link copied");
        setTimeout(() => setCopied(null), 1600);
      },
      () => toast.error("Couldn't copy"),
    );
  };

  if (!isConnected) {
    return (
      <GlassCard className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to see the verify links you&apos;ve created.
        </p>
        <WalletButton />
      </GlassCard>
    );
  }

  if (rows === null) {
    return (
      <GlassCard className="p-8 text-center">
        <ShieldCheck className="mx-auto size-7 text-primary" />
        <h2 className="mt-3 text-lg font-semibold">Prove it&apos;s your wallet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your verify links are shared selectively, so listing them needs a signature
          rather than just an address. Otherwise anyone could enumerate the links you
          sent to one specific landlord. Signing costs nothing and moves nothing.
        </p>
        <Button onClick={load} disabled={loading} className="mt-5 gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Waiting for signature…" : "Show my links"}
        </Button>
      </GlassCard>
    );
  }

  if (rows.length === 0) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm font-medium">No verify links yet.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
          Create one on the Share page to prove your income for a period. The verifier
          recomputes every figure from Arc themselves.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((d) => (
        <GlassCard key={d.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">
                {d.periodStart === d.periodEnd
                  ? d.periodStart
                  : `${d.periodStart} to ${d.periodEnd}`}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {d.txCount} transaction{d.txCount === 1 ? "" : "s"} · created{" "}
                {new Date(d.createdAt).toLocaleDateString()}
              </div>
            </div>

            {d.anchorTxHash ? (
              <a
                href={explorerTx(d.anchorTxHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] text-primary"
              >
                <Anchor className="size-3" />
                Anchored
              </a>
            ) : (
              <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                Not anchored
              </span>
            )}
          </div>

          {d.fields.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {d.fields.map((f) => (
                <span
                  key={f}
                  className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {FIELD_LABEL[f] ?? f}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => copy(d.id)}
            >
              {copied === d.id ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied === d.id ? "Copied" : "Copy link"}
            </Button>
            <a
              href={`/verify/${d.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs transition-colors hover:bg-secondary"
            >
              Open <ExternalLink className="size-3" />
            </a>
          </div>

          {/* Withdraw. Dormant until KredRegistry is configured, and self-gated on
              this being the owner's wallet. */}
          <RevokeButton digest={d.digest} ownerHash={d.ownerHash} />
        </GlassCard>
      ))}
    </div>
  );
}
