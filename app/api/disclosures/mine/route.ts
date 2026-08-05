import { type NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import { db } from "@/lib/db";
import { disclosureDigest, ownerCommitment } from "@/lib/registry";
import { listChallenge } from "@/lib/disclosure-auth";

export const dynamic = "force-dynamic";

/** Window a signature stays valid for. Long enough to survive a slow wallet prompt,
 *  short enough that a captured signature is not a permanent key. */
const MAX_AGE_MS = 5 * 60_000;


/**
 * GET /api/disclosures/mine?address=&ts=&sig=  → this wallet's verify links.
 *
 * Signature-gated, unlike the tag routes, and deliberately so. A verify link is
 * SELECTIVELY disclosed: the owner chooses who receives it. An endpoint that returned
 * every disclosure id for any address on request would let anyone enumerate the links
 * a freelancer had shared with one specific landlord, which quietly destroys the
 * property the whole product is built on. Proving control of the wallet is the
 * cheapest honest gate.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const address = p.get("address");
  const ts = Number(p.get("ts"));
  const sig = p.get("sig");

  if (!address || !isAddress(address) || !sig || !Number.isFinite(ts)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) {
    return NextResponse.json({ error: "signature expired" }, { status: 401 });
  }

  let ok = false;
  try {
    ok = await verifyMessage({
      address: address as Address,
      message: listChallenge(address, ts),
      signature: sig as Hex,
    });
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const rows = await db.disclosure.findMany({
    where: { address: address.toLowerCase() },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      label: true,
      periodStart: true,
      periodEnd: true,
      fields: true,
      txHashes: true,
      anchorTxHash: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    disclosures: rows.map((d) => {
      // txHashes is stored as a JSON array; only the COUNT is useful here, and
      // shipping the hashes would hand a list view the disclosure's contents when it
      // has no use for them.
      let txCount = 0;
      try {
        const parsed = JSON.parse(d.txHashes);
        if (Array.isArray(parsed)) txCount = parsed.length;
      } catch {
        /* a corrupt row reports 0 rather than failing the whole list */
      }
      let hashes: string[] = [];
      try {
        const parsed = JSON.parse(d.txHashes);
        if (Array.isArray(parsed)) hashes = parsed.filter((h): h is string => typeof h === "string");
      } catch {}
      let fields: string[] = [];
      try {
        const parsed = JSON.parse(d.fields);
        if (Array.isArray(parsed)) {
          fields = parsed.filter((f): f is string => typeof f === "string");
        }
      } catch {
        /* same */
      }
      return {
        id: d.id,
        label: d.label,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        fields,
        txCount,
        // The digest, not the hashes: revoke() needs this one value, and the list
        // has no use for the disclosure contents.
        digest: disclosureDigest({
          id: d.id,
          address: address.toLowerCase(),
          periodStart: d.periodStart,
          periodEnd: d.periodEnd,
          txHashes: hashes,
        }),
        ownerHash: ownerCommitment(address),
        anchorTxHash: d.anchorTxHash,
        createdAt: d.createdAt.toISOString(),
      };
    }),
  });
}
