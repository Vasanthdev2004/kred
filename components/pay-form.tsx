"use client";

import { useMemo } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { buildPayWithMemo } from "@/lib/memo";
import { tokenBySymbol } from "@/lib/tokens";
import { ARC_TESTNET_ID, explorerTx } from "@/config/arc";
import { shorten } from "@/lib/utils";
import type { PaymentRequest } from "@/lib/request";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TokenBadge } from "@/components/token-badge";

function MemoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function PayForm({ request }: { request: PaymentRequest }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: hash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const token = tokenBySymbol(request.token);
  const amountUnits = useMemo(() => {
    try {
      return parseUnits(request.amount, token.decimals);
    } catch {
      return null;
    }
  }, [request.amount, token.decimals]);

  const wrongNetwork = isConnected && chainId !== ARC_TESTNET_ID;

  function pay() {
    if (amountUnits === null) return;
    writeContract(
      buildPayWithMemo({
        token: token.address,
        to: request.to,
        amount: amountUnits,
        memo: {
          client: request.client,
          project: request.project,
          invoice: request.invoice,
          period: request.period,
          category: request.category,
          note: request.note,
        },
      }),
    );
  }

  if (isSuccess && hash) {
    return (
      <Card className="gradient-border hairline-top relative overflow-hidden p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
          <CheckCircle2 className="size-7 text-primary" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Payment sent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {request.amount} {request.token} paid to {shorten(request.to)} with its memo
          attached. It now appears in their Payslip, already categorized.
        </p>
        <a
          href={explorerTx(hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          View transaction on Arc
          <ExternalLink className="size-3.5" />
        </a>
      </Card>
    );
  }

  return (
    <Card className="gradient-border hairline-top relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/15 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Payment request
        </span>
        <Badge variant="success">
          <ShieldCheck className="size-3.5" />
          Memo attached
        </Badge>
      </div>

      <div className="relative mt-5 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight nums">
          {request.amount}
        </span>
        <span className="inline-flex items-center gap-1.5 text-lg font-medium text-muted-foreground">
          <TokenBadge symbol={request.token} size="sm" />
          {request.token}
        </span>
      </div>

      <div className="relative mt-1 text-sm text-muted-foreground">
        to <span className="font-mono text-foreground">{shorten(request.to)}</span>
      </div>

      <div className="relative mt-5 divide-y divide-border/60 rounded-lg border border-border bg-secondary/30 px-4">
        <MemoRow label="Client" value={request.client} />
        <MemoRow label="Project" value={request.project} />
        <MemoRow label="Invoice" value={request.invoice} />
        <MemoRow label="Period" value={request.period} />
        <MemoRow label="Category" value={request.category} />
        <MemoRow label="Note" value={request.note} />
      </div>

      <div className="relative mt-6">
        {amountUnits === null ? (
          <p className="text-center text-sm text-destructive">
            Invalid amount in this request link.
          </p>
        ) : !isConnected ? (
          <div className="flex flex-col items-center gap-3">
            <ConnectButton label="Connect wallet to pay" />
            <p className="text-xs text-muted-foreground">
              You&apos;ll send this exact amount and memo through Arc&apos;s Memo
              contract.
            </p>
          </div>
        ) : wrongNetwork ? (
          <Button
            className="w-full"
            onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
            disabled={switching}
          >
            {switching ? "Switching…" : "Switch to Arc Testnet"}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={pay}
            disabled={isPending || confirming}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirm in wallet…
              </>
            ) : confirming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Settling on Arc…
              </>
            ) : (
              `Pay ${request.amount} ${request.token}`
            )}
          </Button>
        )}

        {error && (
          <button
            onClick={() => reset()}
            className="mt-3 block w-full text-center text-xs text-destructive hover:underline"
          >
            {/rejected|denied|user rejected/i.test(error.message)
              ? "Transaction rejected — tap to try again"
              : "Payment failed — tap to try again"}
          </button>
        )}
      </div>
    </Card>
  );
}
