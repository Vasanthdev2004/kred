import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { loadDisclosure, periodText } from "@/lib/disclosure";
import { serverClient } from "@/lib/rpc";
import { recompute } from "@/lib/verify";
import { disclosureDigest, readAnchor } from "@/lib/registry";
import { VerifyView } from "@/components/verify-view";

// Cache each verify render briefly so a flood on one link can't amplify into an RPC
// storm; still recomputes from chain (just at most once per window). The OG share card
// (./opengraph-image) caches on the same window for the same reason.
export const revalidate = 30;

/** Per-disclosure unfurl metadata. Only the period DATES are ever interpolated, and only
 *  when the owner disclosed them — the amounts, the wallet and the free-text label never
 *  reach the title/description, which are readable without opening the link. (The label
 *  is withheld deliberately: its only toggle promises "Show the date range", so consent
 *  for a period is not consent to publish a caption.) */
// NOTE: unfurl != index. The share card (./opengraph-image) renders the income figure,
// and there is no delete endpoint for a disclosure, so an indexed copy would be
// unrevocable — hence the noindex below plus the /verify/ disallow in app/robots.ts.
// Link unfurlers fetch the OG image directly and ignore robots meta, so sharing is
// unaffected.
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const d = await loadDisclosure(params.id);
  const period = d && d.fields.has("period") ? periodText(d) : null;

  const title = "Verified income";
  const description = period
    ? `Income proof for ${period}, recomputed live from Arc on-chain data.`
    : "Income proof recomputed live from Arc on-chain data.";
  const url = `/verify/${params.id}`;

  return {
    title,
    description,
    // Overrides the root layout's site-wide index:true — a disclosure is scoped to
    // whoever the owner sent the link to, not to search.
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    // The root layout pins openGraph.url to "/" — override it so the unfurl links back
    // to this proof rather than the landing page.
    openGraph: { type: "article", url, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VerifyPage({
  params,
}: {
  params: { id: string };
}) {
  const d = await loadDisclosure(params.id);
  if (!d) notFound();

  const client = serverClient();
  const result = await recompute(client, d.address as Address, d.txHashes);

  // F6: is this exact disclosure anchored on-chain? Digest is recomputed from the
  // stored content and checked against the KredRegistry — the DB is never trusted.
  const digest = disclosureDigest({
    address: d.address,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    txHashes: d.txHashes,
  });
  const anchor = await readAnchor(
    client,
    d.address as Address,
    digest,
    d.anchorTxHash,
  );

  return (
    <VerifyView
      disclosure={{
        address: d.address,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        label: d.label,
      }}
      fields={d.fields}
      result={result}
      anchor={anchor}
      droppedTx={d.droppedTx}
    />
  );
}
