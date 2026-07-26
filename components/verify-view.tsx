import Link from "next/link";
import { Anchor, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Hex } from "viem";
import type { RecomputeResult } from "@/lib/verify";
import { ownerCommitment, type AnchorState } from "@/lib/registry";
import { explorerTx } from "@/config/arc";
import { formatAmount, formatDate, shorten } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { TokenBadge } from "@/components/token-badge";
import { RevokeButton } from "@/components/revoke-button";

interface DisclosureMeta {
  address: string;
  periodStart: string;
  periodEnd: string;
  label: string | null;
}

const FIAT_SIGN: Record<string, string> = { USD: "$", EUR: "€" };

export function VerifyView({
  disclosure,
  fields,
  result,
  anchor,
  digest = null,
  droppedTx = 0,
}: {
  disclosure: DisclosureMeta;
  fields: Set<string>;
  /** null when the page declined to recompute at all (withdrawn or unconfirmable proof
   *  — see app/verify/[id]/page.tsx). Treated exactly like nothing verified. */
  result: RecomputeResult | null;
  anchor: AnchorState;
  /** server-computed digest of this disclosure, for the owner-only withdraw control.
   *  Passed down rather than recomputed client-side so there is one digest formula. */
  digest?: Hex | null;
  /** stored hashes the read-side filter rejected (lib/disclosure.ts) — never verified
   *  and never counted, so the total below is understated by that many payments. */
  droppedTx?: number;
}) {
  const clients = new Set(
    (result?.txs ?? []).map((t) => t.memo?.client).filter(Boolean),
  ).size;
  const periodLabel =
    disclosure.periodStart === disclosure.periodEnd
      ? disclosure.periodStart
      : `${disclosure.periodStart} → ${disclosure.periodEnd}`;

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <div className="mb-8 flex justify-center">
        <Link href="/">
          <Logo className="text-lg" />
        </Link>
      </div>

      {anchor.status === "revoked" ? (
        // Revocation withdraws what was shared, so the figures go with it. Saying
        // "revoked" while still printing the totals would leave the proof readable
        // and make the button meaningless.
        <GlassCard className="p-8 text-center">
          <TriangleAlert className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Proof withdrawn</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The owner revoked this proof on {formatDate(anchor.revokedAt * 1000)}.
            Its figures are no longer shown here.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            The revocation is recorded on Arc, so anyone can confirm it was the
            owner who withdrew it and when.
          </p>
        </GlassCard>
      ) : anchor.status === "unknown" ? (
        // We could not reach the registry, so we cannot tell a standing proof from
        // a withdrawn one. Withhold rather than risk showing figures the owner
        // already revoked; this clears on the next load.
        <GlassCard className="p-8 text-center">
          <TriangleAlert className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Can&apos;t confirm status</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Arc could not be reached to check whether this proof is still
            standing, so its figures are withheld. Try again in a moment.
          </p>
        </GlassCard>
      ) : !result || result.verifiedCount === 0 ? (
        <GlassCard className="p-8 text-center">
          <TriangleAlert className="mx-auto size-7 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Nothing to verify</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            None of the disclosed transactions resolved to incoming payments on Arc.
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="p-7">
          <div className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full bg-brand/15 blur-3xl" />

          {/* seal */}
          <div className="relative flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Income Proof
            </span>
            <Badge variant="success">
              <ShieldCheck className="size-3.5" />
              Verified on Arc
            </Badge>
          </div>

          {fields.has("period") && (
            <div className="relative mt-6 text-[11px] uppercase tracking-wider text-muted-foreground">
              Verified income · {periodLabel}
            </div>
          )}

          {/* per-token totals (the headline; no FX guesswork across currencies) */}
          <div className="relative mt-2 space-y-1">
            {result.totals.map((t) => (
              <div key={t.symbol} className="flex items-baseline gap-2">
                <span className="font-mono text-4xl font-semibold tracking-tight nums">
                  {FIAT_SIGN[t.fiat] ?? ""}
                  {formatAmount(t.amount, t.decimals)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TokenBadge symbol={t.symbol} size="sm" />
                  {t.symbol}
                </span>
              </div>
            ))}
          </div>

          {/* disclosed meta */}
          <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {fields.has("count") && (
              <Meta value={String(result.verifiedCount)} label="payments" />
            )}
            {fields.has("clients") && (
              <Meta value={String(clients)} label="clients" />
            )}
            <Meta value="100%" label="on-chain" />
            {fields.has("wallet") ? (
              <Meta value={shorten(disclosure.address, 4)} label="wallet" mono />
            ) : (
              <Meta value="hidden" label="wallet" muted />
            )}
          </div>

          {/* backing transactions — the proof */}
          <div className="relative mt-6 border-t border-border pt-5">
            <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Backed by {result.txs.length} transaction
              {result.txs.length === 1 ? "" : "s"} · recomputed live from Arc
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {result.txs.map((t, i) => (
                <a
                  key={`${t.txHash}-${i}`}
                  href={explorerTx(t.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <TokenBadge symbol={t.tokenSymbol} size="sm" />
                    <span className="truncate">
                      {t.memo?.client ? (
                        <span className="font-medium">{t.memo.client}</span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {shorten(t.txHash)}
                        </span>
                      )}
                      {t.timestamp > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatDate(t.timestamp)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono font-medium nums">
                    {formatAmount(t.amount, t.tokenDecimals)}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </span>
                </a>
              ))}
            </div>
          </div>

          {anchor.status === "anchored" && (
            <div className="relative mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs">
              <Anchor className="size-3.5 shrink-0 text-primary" />
              <span className="font-medium">Anchored on-chain</span>
              <span className="text-muted-foreground">
                {formatDate(anchor.anchoredAt * 1000)}
              </span>
              {anchor.txHash && (
                <a
                  href={explorerTx(anchor.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                >
                  view tx <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}

          <div className="relative mt-5 flex items-center gap-2 border-t border-border pt-4">
            <Logo className="text-xs opacity-70" />
            {/* Each caveat names a different reason a tx is missing from the total, so
                they stay separate: the chain rejected it, we never asked, or the stored
                hash was malformed. */}
            <span className="ml-auto text-right text-[11px] text-muted-foreground">
              Recomputed from Arc, not a database.
              {result.failedCount > 0 &&
                ` ${result.failedCount} disclosed tx omitted (unverifiable).`}
              {result.overCap > 0 &&
                ` ${result.overCap} beyond the disclosure cap not verified.`}
              {droppedTx > 0 &&
                ` ${droppedTx} disclosed tx unreadable (malformed hash).`}
            </span>
          </div>
        </GlassCard>
      )}

      {/* Owner-only withdraw. Without it revocation lives solely in the tab that created
          the proof, so a link shared on Monday couldn't be pulled on Friday. RevokeButton
          renders nothing unless the connected wallet hashes to this proof's owner, so
          every other visitor sees an unchanged page — and it's hidden once the proof is
          already withdrawn, when there is nothing left to withdraw. */}
      {digest && anchor.status !== "revoked" && (
        <RevokeButton
          digest={digest}
          ownerHash={ownerCommitment(disclosure.address)}
        />
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Every figure links to a transaction you can inspect yourself on{" "}
        <span className="text-foreground">Arc</span>. Kred stores no amounts.
      </p>

      <div className="mt-10 rounded-xl border border-dashed border-border p-5 text-center">
        <p className="text-sm font-medium">Get paid in stablecoins too?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Turn your own Arc payment history into proof like this. Free, open
          source, nothing to install.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          Create your income passport →
        </Link>
      </div>
    </div>
  );
}

function Meta({
  value,
  label,
  mono,
  muted,
}: {
  value: string;
  label: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-semibold nums ${mono ? "font-mono text-sm" : ""} ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
