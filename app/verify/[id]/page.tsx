import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address, Hex } from "viem";
import { loadDisclosure, periodText } from "@/lib/disclosure";
import { serverClient } from "@/lib/rpc";
import { recompute } from "@/lib/verify";
import { disclosureDigest, readAnchor, type AnchorState } from "@/lib/registry";
import { VerifyView } from "@/components/verify-view";

// Cache each verify render briefly so a flood on one link can't amplify into an RPC
// storm; still recomputes from chain (just at most once per window). The OG share card
// (./opengraph-image) caches on the same window for the same reason.
export const revalidate = 30;

/** Digest + chain state for one disclosure. `cache` (like loadDisclosure) dedupes this
 *  between generateMetadata and the page render of the same request, so checking the
 *  anchor in both places still costs a single multicall. */
const anchorFor = cache(
  async (id: string): Promise<{ digest: Hex; anchor: AnchorState } | null> => {
    const d = await loadDisclosure(id);
    if (!d) return null;
    // F6: is this exact disclosure anchored on-chain? Digest is recomputed from the
    // stored content and checked against the KredRegistry — the DB is never trusted.
    const digest = disclosureDigest({
      id: d.id,
      address: d.address,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      txHashes: d.txHashes,
    });
    const anchor = await readAnchor(
      serverClient(),
      d.address as Address,
      digest,
      d.anchorTxHash,
    );
    return { digest, anchor };
  },
);

/** A proof whose figures we are allowed to show: neither withdrawn nor unreadable.
 *  `unknown` counts as withheld — a failed registry read must never pass for "fine". */
function isLive(anchor: AnchorState | undefined): boolean {
  if (!anchor) return false;
  return anchor.status !== "revoked" && anchor.status !== "unknown";
}

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
  // Gate the text on the chain exactly like the page and the card do. Without this a
  // withdrawn proof still unfurls as "Verified income" for <period> beside the generic
  // fallback image — the words are the part a reader actually takes away, and this is
  // the one surface where `unknown` would otherwise read as fine.
  const live = isLive((await anchorFor(params.id))?.anchor);
  const period = live && d && d.fields.has("period") ? periodText(d) : null;

  const title = live ? "Verified income" : "Income proof";
  const description = live
    ? period
      ? `Income proof for ${period}, recomputed live from Arc on-chain data.`
      : "Income proof recomputed live from Arc on-chain data."
    : "Open the link to check this proof's current status on Arc.";
  const url = `/verify/${params.id}`;

  return {
    title,
    description,
    // Overrides the root layout's site-wide index:true — a disclosure is scoped to
    // whoever the owner sent the link to, not to search.
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    // The root layout pins openGraph.url to "/" — override it so the unfurl links back
    // to this proof rather than the landing page. "article" asserts a published piece of
    // content, which a withdrawn or unconfirmable proof no longer is.
    openGraph: { type: live ? "article" : "website", url, title, description },
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

  // Ask the chain FIRST. A withdrawn (or unconfirmable) proof never shows its figures,
  // so recomputing it would fan out to up to MAX_DISCLOSURE_TX receipts just to throw
  // the result away — and that is exactly the link most likely to be hammered.
  // (./opengraph-image orders itself the same way.)
  const state = await anchorFor(params.id);
  const anchor = state?.anchor ?? { status: "unknown" as const };
  const result = isLive(anchor)
    ? await recompute(serverClient(), d.address as Address, d.txHashes)
    : null;

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
      digest={state?.digest ?? null}
      droppedTx={d.droppedTx}
    />
  );
}
