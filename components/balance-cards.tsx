"use client";

import { useAccount, useReadContracts } from "wagmi";
import { ExternalLink } from "lucide-react";
import { TOKENS } from "@/lib/tokens";
import { ERC20_ABI } from "@/lib/abi";
import { ARC } from "@/config/arc";
import { formatAmount, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/** Live USDC/EURC balances for the connected wallet (a sanity check that the
 *  Arc RPC + token addresses resolve). Real income lands in M1's indexer. */
export function BalanceCards() {
  const { address, isConnected } = useAccount();

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: TOKENS.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: Boolean(address) },
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TOKENS.map((t, i) => {
        const result = data?.[i];
        const value =
          result && result.status === "success"
            ? (result.result as bigint)
            : 0n;
        return (
          <Card key={t.symbol} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {t.name}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  t.symbol === "USDC"
                    ? "bg-primary/15 text-primary"
                    : "bg-sky-500/15 text-sky-500",
                )}
              >
                {t.symbol}
              </span>
            </div>
            <div className="mt-3 font-mono text-2xl font-semibold tabular-nums">
              {isConnected && isLoading ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatAmount(value, t.decimals)
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              wallet balance
            </div>
          </Card>
        );
      })}
      <a
        href={ARC.faucetUrl}
        target="_blank"
        rel="noreferrer"
        className="sm:col-span-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        Need test funds? Get USDC/EURC from the Circle faucet
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
