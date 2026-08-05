"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits, type Hex } from "viem";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  RotateCcw,
  Send,
} from "lucide-react";
import { ARC_TESTNET_ID, explorerTx } from "@/config/arc";
import { ERC20_ABI } from "@/lib/abi";
import { tokenBySymbol } from "@/lib/tokens";
import { formatAmount, shorten } from "@/lib/utils";
import {
  KRED_ESCROW_ABI,
  escrowAddress,
  invoiceIdFor,
  readEscrow,
  type EscrowState,
} from "@/lib/escrow";
import type { PaymentRequest } from "@/lib/request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";

/** Default window a payer commits to. Long enough that a freelancer is not racing a
 *  clock, short enough that funds are not stranded forever if work never lands. */
const DEFAULT_DAYS = 30;

/**
 * Escrow for a payment request.
 *
 * An invoice says money is owed. Escrow says money is already committed, which is the
 * difference between a promise and working capital: the freelancer can see the funds
 * without holding them, and the client keeps control until work is delivered.
 *
 * Both parties reach this from the SAME /pay link. The invoice id is derived from the
 * request itself, so there is no shared record to look up and nothing to keep in sync;
 * the panel decides what to show from who is connected, not from a stored role.
 */
export function EscrowPanel({ request }: { request: PaymentRequest }) {
  const registry = escrowAddress();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const client = usePublicClient();

  const token = tokenBySymbol(request.token);
  const invoiceId = useMemo(() => invoiceIdFor(request), [request]);
  const units = useMemo(() => {
    try {
      return parseUnits(request.amount, token.decimals);
    } catch {
      return null;
    }
  }, [request.amount, token.decimals]);

  const [state, setState] = useState<EscrowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [releaseAmt, setReleaseAmt] = useState("");

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Re-read after any confirmed write, so the panel reflects the chain rather than an
  // optimistic guess about what the write did.
  useEffect(() => {
    let alive = true;
    if (!client || !registry) {
      setLoading(false);
      return;
    }
    (async () => {
      const s = await readEscrow(client, invoiceId as Hex);
      if (alive) {
        setState(s);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, registry, invoiceId, isSuccess]);

  if (!registry) return null; // dormant until KredEscrow is deployed
  if (units === null) return null; // malformed amount; the pay form already complains

  /**
   * An escrow at this id is not automatically THIS invoice's escrow.
   *
   * The id is derived from a public /pay link, so anyone holding the link can open
   * an escrow there. The contract's allowlist means they must use real USDC or EURC,
   * but nothing stops a squatter committing one cent and letting the panel announce
   * "funded" to a freelancer who then goes and does the work.
   *
   * So the terms are checked here rather than assumed: right token, right payee, and
   * at least the invoiced amount. Anything else is shown as a mismatch, not as money.
   */
  const mismatch =
    state &&
    (state.token.toLowerCase() !== token.address.toLowerCase() ||
      state.payee.toLowerCase() !== request.to.toLowerCase() ||
      state.total < units);

  const wrongNetwork = isConnected && chainId !== ARC_TESTNET_ID;
  const isPayer = Boolean(
    address && state && address.toLowerCase() === state.payer.toLowerCase(),
  );
  const isPayee = Boolean(
    address && address.toLowerCase() === request.to.toLowerCase(),
  );
  const deadlineFor = () =>
    BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DAYS * 86_400);

  // Approve exactly the amount rather than an unlimited allowance: this contract has
  // no admin key, but a leftover infinite approval outlives the invoice and is not
  // ours to leave lying around.
  const approve = () =>
    writeContract({
      chainId: ARC_TESTNET_ID,
      address: token.address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [registry, units],
    });

  const open = () =>
    writeContract({
      chainId: ARC_TESTNET_ID,
      address: registry,
      abi: KRED_ESCROW_ABI,
      functionName: "open",
      args: [invoiceId as Hex, request.to, token.address, units, deadlineFor()],
    });

  const release = () => {
    if (!state) return;
    let amt: bigint;
    try {
      amt = releaseAmt.trim()
        ? parseUnits(releaseAmt.trim(), token.decimals)
        : state.remaining;
    } catch {
      return;
    }
    if (amt <= 0n || amt > state.remaining) return;
    writeContract({
      chainId: ARC_TESTNET_ID,
      address: registry,
      abi: KRED_ESCROW_ABI,
      functionName: "release",
      args: [invoiceId as Hex, amt],
    });
  };

  const refund = () =>
    writeContract({
      chainId: ARC_TESTNET_ID,
      address: registry,
      abi: KRED_ESCROW_ABI,
      functionName: "refund",
      args: [invoiceId as Hex],
    });

  const busy = isPending || confirming;

  return (
    <GlassCard className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <Lock className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Escrow</h3>
        {state && (
          <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground">
            {state.closed
              ? "Settled"
              : state.released > 0n
                ? "Part released"
                : "Funded"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Reading escrow…</p>
      ) : mismatch ? (
        /* Something is committed at this id, but not on this invoice's terms.
           Say so plainly rather than dressing it up as funding. */
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            An escrow exists here, but it does not match this invoice.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Anyone with this link can open an escrow at this id. This one is for a
            different token, a different recipient, or less than the invoiced amount,
            so do not treat it as payment. Reissue the invoice with a different
            invoice number to get a fresh id.
          </p>
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
            holds {formatAmount(state!.total, token.decimals)} · payee{" "}
            {shorten(state!.payee, 4)}
          </div>
        </div>
      ) : !state ? (
        /* Nothing committed yet — this is the payer's decision to make. */
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Commit the {request.amount} {request.token} now and release it as work is
            delivered. The freelancer can see it is funded, you keep control until you
            release, and anything unreleased returns to you after {DEFAULT_DAYS} days.
          </p>
          {wrongNetwork ? (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
              disabled={switching}
            >
              {switching ? "Switching…" : "Switch to Arc to fund escrow"}
            </Button>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={approve}
                disabled={busy || !isConnected}
              >
                1. Approve {request.token}
              </Button>
              <Button
                onClick={open}
                disabled={busy || !isConnected}
                className="gap-1.5"
              >
                <Lock className="size-4" />
                2. Fund escrow
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Two steps: the token contract has to approve this escrow before it can pull
            the funds. Approval is for this amount only.
          </p>
        </>
      ) : (
        <>
          {/* Amounts formatted from base units — never float maths. */}
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <Figure
              label="Committed"
              value={formatAmount(state.total, token.decimals)}
            />
            <Figure
              label="Released"
              value={formatAmount(state.released, token.decimals)}
            />
            <Figure
              label="Remaining"
              value={formatAmount(state.remaining, token.decimals)}
            />
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${
                  state.total > 0n ? Number((state.released * 100n) / state.total) : 0
                }%`,
              }}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {shorten(state.payer, 4)} → {shorten(state.payee, 4)} ·{" "}
            {state.closed
              ? "closed"
              : `reclaimable after ${new Date(state.deadline * 1000).toLocaleDateString()}`}
          </p>

          {/* Only the payer can act. Releasing IS the statement that work landed. */}
          {isPayer && !state.closed && (
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={releaseAmt}
                  onChange={(e) => setReleaseAmt(e.target.value)}
                  placeholder={`Amount (default all: ${formatAmount(state.remaining, token.decimals)})`}
                  inputMode="decimal"
                  className="h-9 text-sm"
                />
                <Button onClick={release} disabled={busy} className="h-9 shrink-0 gap-1.5">
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Release
                </Button>
              </div>
              {state.refundable && (
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={refund}
                  disabled={busy}
                >
                  <RotateCcw className="size-4" />
                  Reclaim {formatAmount(state.remaining, token.decimals)}{" "}
                  {request.token}
                </Button>
              )}
            </div>
          )}

          {isPayee && !state.closed && (
            <p className="mt-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              These funds are committed to you on-chain. Your client releases them as
              milestones are delivered, so you do not have to chase an invoice to know
              the money exists.
            </p>
          )}
        </>
      )}

      {isSuccess && hash && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="size-3.5 text-primary" />
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            view tx <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {error && (
        <button
          onClick={() => reset()}
          className="mt-2 block w-full text-center text-xs text-destructive hover:underline"
        >
          {/rejected|denied|user rejected/i.test(error.message)
            ? "Rejected — tap to try again"
            : `Failed: ${error.message.split("\n")[0].slice(0, 90)}`}
        </button>
      )}
    </GlassCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold nums">{value}</div>
    </div>
  );
}
