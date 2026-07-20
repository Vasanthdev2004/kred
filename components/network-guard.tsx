"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import { ARC_TESTNET_ID } from "@/config/arc";
import { Button } from "@/components/ui/button";

/** Banner shown when a connected wallet is on the wrong network. */
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === ARC_TESTNET_ID) return null;

  return (
    <div className="container mt-4">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          <span>
            Wrong network. Payslip reads income from{" "}
            <strong>Arc Testnet</strong>.
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
          disabled={isPending}
        >
          {isPending ? "Switching…" : "Switch to Arc Testnet"}
        </Button>
      </div>
    </div>
  );
}
