"use client";

import { useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import { Ban, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import {
  KRED_REGISTRY_ABI,
  ownerCommitment,
  registryAddress,
} from "@/lib/registry";
import { ARC_TESTNET_ID, explorerTx } from "@/config/arc";
import { shorten } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** F6 — let the disclosure owner withdraw a proof they already shared, on-chain.
 *
 *  Revocation is one-way: the contract has no un-revoke, because a verifier who has
 *  seen a proof reported as withdrawn must never see it come back. So this always
 *  asks before it writes. Dormant (renders nothing) until KredRegistry is deployed.
 *
 *  Mounted both where a proof is created (components/share-builder.tsx) and on the
 *  public /verify page, so a link shared on Monday can still be withdrawn on Friday
 *  from any device — not only from the tab that happened to create it. */
export function RevokeButton({
  digest,
  ownerHash,
}: {
  digest: Hex;
  /** ownerCommitment() of the wallet that created this proof. A commitment rather than
   *  the address itself because /verify is public and would otherwise serialize the
   *  wallet into every visitor's page payload (see lib/registry.ts). The contract keys
   *  revocations by msg.sender, so only that wallet can actually withdraw it. */
  ownerHash: Hex;
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!registry) return null; // dormant until KredRegistry is deployed

  if (isSuccess && hash) {
    return (
      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm">
        <CheckCircle2 className="size-4 text-muted-foreground" />
        <span className="font-medium">Proof withdrawn</span>
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

  // Only the owner's revocation means anything. revoke() has NO owner check — it keys by
  // msg.sender — so a stranger's call wouldn't revert, it would succeed as a no-op in
  // their own namespace and leave this proof standing. Showing them a button that appears
  // to work (and costs gas) is worse than showing them nothing.
  if (!isConnected || !address) return null;
  if (ownerCommitment(address) !== ownerHash) return null;

  const wrongNetwork = chainId !== ARC_TESTNET_ID;

  return (
    <div className="mt-3">
      {wrongNetwork ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
          disabled={switching}
        >
          {switching ? "Switching…" : "Switch to Arc to withdraw"}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
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
              Withdrawing on Arc…
            </>
          ) : (
            <>
              <Ban className="size-4" />
              Withdraw this proof
            </>
          )}
        </Button>
      )}

      {error && (
        <button
          onClick={() => reset()}
          className="mt-2 block w-full text-center text-xs text-destructive hover:underline"
        >
          {/rejected|denied|user rejected/i.test(error.message)
            ? "Rejected — tap to try again"
            : "Withdraw failed — tap to try again"}
        </button>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this proof?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {/* Slack, X, Discord, Telegram and LinkedIn cache the unfurled card on
                    their own servers and never re-fetch it, so promising the link stops
                    unfurling everywhere would be a promise spent on an irreversible
                    action. Say what actually happens instead. */}
                <p>
                  The verify page will stop showing your figures, and new
                  unfurls will stop showing them. Cards already cached by Slack,
                  X and others may keep showing the old figures.
                </p>
                <p>
                  This cannot be undone. Revocation is recorded on Arc so a
                  verifier can confirm you withdrew it, which also means it
                  cannot be reversed later. To share again, create a new proof.
                </p>
                <p className="text-xs">
                  Signed by{" "}
                  <span className="font-mono text-foreground">
                    {shorten(address)}
                  </span>
                  . Anyone who already saved the figures still has them.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => {
                setConfirmOpen(false);
                writeContract({
                  // Pinned: the wallet could have switched networks while the dialog was
                  // open, and an irreversible write must not land on another chain.
                  chainId: ARC_TESTNET_ID,
                  address: registry,
                  abi: KRED_REGISTRY_ABI,
                  functionName: "revoke",
                  args: [digest],
                });
              }}
            >
              <Ban className="size-4" />
              Withdraw permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
