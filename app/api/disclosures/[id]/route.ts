import { type NextRequest, NextResponse } from "next/server";
import { decodeEventLog, type Address, type Hex } from "viem";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadDisclosure } from "@/lib/disclosure";
import { serverClient } from "@/lib/rpc";
import {
  KRED_REGISTRY_ABI,
  disclosureDigest,
  registryAddress,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

const input = z.object({
  anchorTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/** PATCH /api/disclosures/[id] → record the on-chain anchor tx for a disclosure.
 *
 *  The disclosure id is PUBLIC (it's the /verify/[id] link), so this endpoint can't
 *  trust its caller. Before storing the tx as the verify page's "view tx" link, we
 *  confirm on-chain that the tx actually emitted KredRegistry.Anchored(owner, digest)
 *  for THIS disclosure's owner + recomputed digest. A bogus or unrelated hash is
 *  rejected — so the display link can't be spoofed. (The "Anchored on-chain" badge
 *  itself is always read from the contract at /verify, never from this field.) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid anchor tx" }, { status: 400 });
  }

  const registry = registryAddress();
  if (!registry) {
    return NextResponse.json(
      { error: "registry not configured" },
      { status: 400 },
    );
  }

  // Load through the SAME parser /verify uses (lib/disclosure.ts). Filtering the stored
  // hashes any other way here — e.g. accepting every string instead of applying TX_HASH —
  // would let this route verify a digest /verify never computes, so the badge and the
  // recorded tx would describe different things.
  const d = await loadDisclosure(params.id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The exact digest this disclosure anchors (from stored content).
  const digest = disclosureDigest({
    id: d.id,
    address: d.address,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    txHashes: d.txHashes,
  });

  // Verify the tx really anchored (owner = d.address, this digest) via its logs.
  const txHash = parsed.data.anchorTxHash.toLowerCase() as Hex;
  const registryLc = registry.toLowerCase();
  let anchored = false;
  try {
    const receipt = await serverClient().getTransactionReceipt({ hash: txHash });
    if (receipt.status === "success") {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== registryLc) continue;
        try {
          const decoded = decodeEventLog({
            abi: KRED_REGISTRY_ABI,
            data: log.data,
            topics: log.topics as [Hex, ...Hex[]],
          });
          if (decoded.eventName !== "Anchored") continue;
          const args = decoded.args as unknown as {
            owner: Address;
            digest: Hex;
          };
          if (
            args.owner.toLowerCase() === d.address.toLowerCase() &&
            args.digest.toLowerCase() === digest.toLowerCase()
          ) {
            anchored = true;
            break;
          }
        } catch {
          /* not the Anchored event */
        }
      }
    }
  } catch {
    /* receipt/RPC error → treat as unverified */
  }

  if (!anchored) {
    return NextResponse.json(
      { error: "tx does not anchor this disclosure" },
      { status: 400 },
    );
  }

  await db.disclosure.update({
    where: { id: params.id },
    data: { anchorTxHash: txHash },
  });
  return NextResponse.json({ ok: true });
}
