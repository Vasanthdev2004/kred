"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { ExternalLink, Lock } from "lucide-react";
import { usePreviewAddress } from "@/lib/preview";
import { tokenByAddress } from "@/lib/tokens";
import { formatAmount, shorten } from "@/lib/utils";
import { escrowAddress, listEscrowsFor, type EscrowEntry } from "@/lib/escrow";
import { explorerAddress } from "@/config/arc";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Escrows committed to this wallet.
 *
 * The escrow lives on the payer's side of a /pay link, which meant a freelancer had no
 * way to see money committed to them without keeping the original link. This is the
 * number they actually want: what is promised, what has landed, and what is still held.
 *
 * Totals are per token and never summed — there is no FX rate anywhere in this app.
 */
export function EscrowInbox() {
  const { address: wagmiAddress } = useAccount();
  const preview = usePreviewAddress();
  const address = wagmiAddress ?? preview;
  const client = usePublicClient();

  const [rows, setRows] = useState<EscrowEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!client || !address || !escrowAddress()) {
      setLoading(false);
      return;
    }
    (async () => {
      const r = await listEscrowsFor(client, address as Address);
      if (!alive) return;
      // null means the scan failed. Rendering "no escrows" then would be a claim
      // about this wallet made from a request that never succeeded.
      setFailed(r === null);
      setRows(r ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [client, address]);

  if (!escrowAddress()) return null; // dormant until deployed
  if (loading) return null; // silent until there is something to say
  if (!failed && rows && rows.length === 0) return null; // nothing committed yet

  // Per token: committed, released, still held.
  const totals = new Map<
    string,
    { decimals: number; total: bigint; released: bigint; remaining: bigint }
  >();
  for (const e of rows ?? []) {
    const meta = tokenByAddress(e.token);
    if (!meta) continue;
    const t = totals.get(meta.symbol) ?? {
      decimals: meta.decimals,
      total: 0n,
      released: 0n,
      remaining: 0n,
    };
    t.total += e.total;
    t.released += e.released;
    t.remaining += e.remaining;
    totals.set(meta.symbol, t);
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Lock className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Committed to you</h2>
        {!failed && rows && (
          <span className="ml-auto text-xs text-muted-foreground">
            {rows.length} escrow{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {failed ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Couldn&apos;t read escrows from Arc just now. This is the read path, not your
          funds.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[...totals].map(([sym, t]) => (
              <div key={sym} className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {sym}
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold nums">
                  {formatAmount(t.remaining, t.decimals)}
                </div>
                <div className="text-xs text-muted-foreground">
                  still held · {formatAmount(t.released, t.decimals)} released of{" "}
                  {formatAmount(t.total, t.decimals)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5">
            {(rows ?? []).slice(0, 5).map((e) => {
              const meta = tokenByAddress(e.token);
              const due = new Date(e.deadline * 1000);
              return (
                <div
                  key={e.invoiceId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    from {shorten(e.payer, 4)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs nums">
                      {meta
                        ? `${formatAmount(e.remaining, meta.decimals)} ${meta.symbol}`
                        : "—"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {e.closed ? "settled" : `to ${due.toLocaleDateString()}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <a
            href={explorerAddress(escrowAddress()!)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Escrow contract on Arc <ExternalLink className="size-3" />
          </a>
        </>
      )}
    </GlassCard>
  );
}
