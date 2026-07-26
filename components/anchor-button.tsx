"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import { Anchor, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { KRED_REGISTRY_ABI, registryAddress } from "@/lib/registry";
import { ARC_TESTNET_ID, explorerTx } from "@/config/arc";
import { shorten } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** F6 — let the disclosure owner stamp a tamper-evident digest of this proof onto
 *  Arc via KredRegistry. Dormant (renders nothing) until the contract is deployed. */
export function AnchorButton({
  disclosureId,
  digest,
  owner,
}: {
  disclosureId: string;
  digest: Hex;
  /** the wallet that created this proof — the anchor must be signed by it, since the
   *  contract keys anchors by msg.sender and /verify reads anchoredAt(owner, digest). */
  owner: string;
}) {
  const registry = registryAddress();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: hash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });
  const [saved, setSaved] = useState(false);

  // Record the anchor tx once for a display link — the verify page still reads the
  // proof itself from the contract, so this is convenience, not trust.
  useEffect(() => {
    if (isSuccess && hash && !saved) {
      setSaved(true);
      fetch(`/api/disclosures/${disclosureId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anchorTxHash: hash }),
      }).catch(() => {});
    }
  }, [isSuccess, hash, saved, disclosureId]);

  if (!registry) return null; // feature dormant until KredRegistry is deployed

  if (isSuccess && hash) {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm">
        <CheckCircle2 className="size-4 text-primary" />
        <span className="font-medium">Anchored on-chain</span>
        <a
          href={explorerTx(hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          view tx <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  const wrongNetwork = isConnected && chainId !== ARC_TESTNET_ID;
  const ownerMismatch =
    isConnected && !!address && address.toLowerCase() !== owner.toLowerCase();

  return (
    <div className="mt-4">
      {!isConnected ? null : ownerMismatch ? (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
          Connect the wallet that created this proof (
          <span className="font-mono text-foreground">{shorten(owner)}</span>) to
          anchor it on-chain.
        </p>
      ) : wrongNetwork ? (
        <Button
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
          disabled={switching}
        >
          {switching ? "Switching…" : "Switch to Arc to anchor"}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="w-full gap-1.5"
          onClick={() =>
            writeContract({
              // Pinned: `wrongNetwork` is only a render-time check, so a wallet-side
              // network switch between it and the click would otherwise anchor on
              // whatever chain the wallet drifted to.
              chainId: ARC_TESTNET_ID,
              address: registry,
              abi: KRED_REGISTRY_ABI,
              functionName: "anchor",
              args: [digest],
            })
          }
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
              Anchoring on Arc…
            </>
          ) : (
            <>
              <Anchor className="size-4" />
              Anchor this proof on-chain
            </>
          )}
        </Button>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Optional: stamp a tamper-evident digest of this proof onto Arc. The verify
        page will show when it was anchored — no amounts ever go on-chain.
      </p>
      {error && (
        <button
          onClick={() => reset()}
          className="mt-2 block w-full text-center text-xs text-destructive hover:underline"
        >
          {/rejected|denied|user rejected/i.test(error.message)
            ? "Rejected — tap to try again"
            : "Anchor failed — tap to try again"}
        </button>
      )}
    </div>
  );
}
