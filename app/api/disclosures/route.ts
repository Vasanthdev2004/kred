import { type NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import { db } from "@/lib/db";
import { disclosureDigest } from "@/lib/registry";
import { MAX_DISCLOSURE_TX } from "@/lib/verify";

export const dynamic = "force-dynamic";

const input = z.object({
  address: z.string().refine(isAddress, "invalid address"),
  periodStart: z.string().min(1).max(20),
  periodEnd: z.string().min(1).max(20),
  label: z.string().max(60).optional().nullable(),
  fields: z.array(z.string().max(20)).max(10),
  txHashes: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
    .min(1, "no transactions to disclose")
    .max(MAX_DISCLOSURE_TX), // bounds per-verify RPC fan-out (see /verify caching)
});

/** POST /api/disclosures → create a selective-disclosure record; returns its id.
 *  Stores only which txs + which fields; amounts are recomputed from chain at /verify. */
export async function POST(req: NextRequest) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid disclosure", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const address = d.address.toLowerCase();
  const txHashes = [...new Set(d.txHashes.map((h) => h.toLowerCase()))];
  const created = await db.disclosure.create({
    data: {
      address,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      label: d.label ?? null,
      fields: JSON.stringify(d.fields),
      txHashes: JSON.stringify(txHashes),
    },
  });
  // Server-computed digest the owner anchors on-chain (F6). Computed from the exact
  // stored content so it matches the recompute at /verify — the client never derives it.
  const digest = disclosureDigest({
    address,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    txHashes,
  });
  return NextResponse.json({ id: created.id, digest });
}
