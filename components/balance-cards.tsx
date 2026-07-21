"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { ExternalLink } from "lucide-react";
import { TOKENS } from "@/lib/tokens";
import { ERC20_ABI } from "@/lib/abi";
import { ARC, ARC_TESTNET_ID } from "@/config/arc";
import { usePreviewAddress } from "@/lib/preview";
import { formatAmount } from "@/lib/utils";
import { TokenLogo } from "@/components/token-logo";

/** Compact "in wallet now" strip — secondary to income. Real USDC/EURC balances. */
export function BalanceCards() {
  const { address: wagmiAddress } = useAccount();
  const preview = usePreviewAddress();
  const address = wagmiAddress ?? preview;

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: TOKENS.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      // Pin to Arc: without this, reads follow the wallet's CURRENT network, so a
      // wallet parked on another chain made both balances "fail" (shown as 0).
      chainId: ARC_TESTNET_ID,
    })),
    query: {
      enabled: Boolean(address),
      // Public Arc RPC can transiently rate-limit; back off and retry, keep the
      // last good balances while refetching, and refresh on an interval so the
      // strip self-heals after payments / network blips.
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchInterval: 30_000,
      placeholderData: keepPreviousData,
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        In wallet
      </span>
      {TOKENS.map((t, i) => {
        const r = data?.[i];
        const ok = r?.status === "success";
        return (
          <span key={t.symbol} className="inline-flex items-center gap-1.5">
            <TokenLogo symbol={t.symbol} className="size-4" />
            <span className="font-mono font-medium tabular-nums">
              {/* Never render a failed read as 0 — "0" is a claim, "—" is honest. */}
              {ok
                ? formatAmount(r.result as bigint, t.decimals)
                : isLoading
                  ? "…"
                  : "—"}
            </span>
            <span className="text-muted-foreground">{t.symbol}</span>
          </span>
        );
      })}
      <a
        href={ARC.faucetUrl}
        target="_blank"
        rel="noreferrer"
        className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Fund testnet wallet
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
