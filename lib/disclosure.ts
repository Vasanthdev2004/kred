/**
 * Loading + selective-disclosure gating for a public /verify link.
 *
 * The verify page, its metadata, and its OG share card all read a disclosure through
 * here so they can never drift: `fields` is an ALLOW-LIST of what the owner chose to
 * reveal, so anything absent from it is hidden. The share card is the most public
 * surface of the three (it is unfurled by anyone the link is pasted to, with no click),
 * so when the record is unreadable we always fail closed rather than guess.
 */
import { cache } from "react";
import type { Hex } from "viem";
import { db } from "@/lib/db";

/** Same shape the API enforces on write (app/api/disclosures/route.ts) — re-applied on
 *  read so a hand-edited row can't push non-hashes into an RPC call. */
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export interface LoadedDisclosure {
  id: string;
  address: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  anchorTxHash: string | null;
  /** disclosed tx hashes, deduped by the API at create time */
  txHashes: Hex[];
  /** how many stored entries the TX_HASH filter above rejected. Non-zero means the row
   *  no longer describes the disclosure the owner created, so every total derived from
   *  `txHashes` is UNDERSTATED — callers must treat it exactly like a failed read. */
  droppedTx: number;
  /** allow-list of visible field keys — see FIELD_OPTIONS in components/share-builder */
  fields: Set<string>;
}

/** Fetch + parse a disclosure. `cache` dedupes the read between generateMetadata and
 *  the page render of the same request. Returns null when the id is unknown. */
export const loadDisclosure = cache(
  async (id: string): Promise<LoadedDisclosure | null> => {
    const d = await db.disclosure.findUnique({ where: { id } });
    if (!d) return null;

    let txHashes: Hex[] = [];
    let droppedTx = 0;
    let fields: string[] = [];
    try {
      const rawTx: unknown = JSON.parse(d.txHashes);
      const rawList = Array.isArray(rawTx) ? rawTx : [];
      txHashes = rawList.filter(
        (h): h is Hex => typeof h === "string" && TX_HASH.test(h),
      );
      // Count what the filter threw away rather than dropping it silently: a hand-edited
      // row with 7 good and 3 bad hashes must not read as a complete 7-tx proof.
      droppedTx = rawList.length - txHashes.length;
      const rawFields: unknown = JSON.parse(d.fields);
      fields = Array.isArray(rawFields)
        ? rawFields.filter((f): f is string => typeof f === "string")
        : [];
    } catch {
      /* corrupt record — recompute will simply verify nothing, and with an empty
         allow-list nothing optional is revealed either */
    }

    return {
      id: d.id,
      address: d.address,
      label: d.label,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      anchorTxHash: d.anchorTxHash,
      txHashes,
      droppedTx,
      fields: new Set(fields),
    };
  },
);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-01" -> "Jan 2026". Anything else (e.g. the "all" sentinel) passes through. */
function monthLabel(value: string): string {
  if (value === "all") return "All time";
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return name ? `${name} ${m![1]}` : value;
}

/** Period label for share surfaces: "Jan 2026" or "Jan 2026 to Jun 2026".
 *  Deliberately plain-ASCII (no "→" like the verify page uses) — the OG card draws
 *  through the bundled Geist faces alone and strips anything outside SAFE_GLYPHS
 *  (app/verify/[id]/opengraph-image.tsx), a range that does not cover "→". */
export function periodText(
  d: Pick<LoadedDisclosure, "periodStart" | "periodEnd">,
): string {
  const start = monthLabel(d.periodStart);
  const end = monthLabel(d.periodEnd);
  return start === end ? start : `${start} to ${end}`;
}
