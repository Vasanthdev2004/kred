import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import type { Address } from "viem";
import {
  loadDisclosure,
  periodText,
  type LoadedDisclosure,
} from "@/lib/disclosure";
import { serverClient } from "@/lib/rpc";
import { MAX_DISCLOSURE_TX, recompute, type RecomputeResult } from "@/lib/verify";
import { formatAmount, shorten } from "@/lib/utils";

// Route segment config
export const alt = "Kred verified income proof, recomputed live from Arc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same window as ../page.tsx (must stay in sync — Next only accepts a literal here), so
// a link flood can't amplify into an RPC storm and the card is never staler than the
// page it previews. Deliberately NO `runtime = "edge"`: this reads the disclosure
// through Prisma, which is Node-only.
export const revalidate = 30;

/**
 * Per-disclosure share card. Fully self-contained — no remote fonts, images or fetches —
 * and restricted to the CSS subset Satori actually implements: solid colors, a single
 * linear-gradient, flexbox with an explicit `display` on every node, border-radius and
 * background-clip:text. No radial-gradient (its `<size> at <pos>` form is what broke a
 * previous Railway build), no gradient <defs>, no blur/mask/shadow, no Tailwind.
 *
 * PRIVACY: this image is unfurled by anyone the link is pasted to, without a click, so
 * it renders strictly LESS than the verify page — every optional figure is gated on the
 * owner's allow-list, and anything unreadable falls back to the generic card.
 */

const BRAND = "linear-gradient(120deg, #31DB90 0%, #1FC7E6 100%)";
const WASH =
  "linear-gradient(125deg, rgba(49,219,144,0.16) 0%, rgba(49,219,144,0) 34%, rgba(31,199,230,0) 66%, rgba(31,199,230,0.16) 100%)";
const CANVAS = "#0A0B0D";
const HEADLINE = "#F0F5F5";
const CHIP_TEXT = "#EAF1F1";
const SECONDARY = "#B7C4C8";
const BODY = "#98A6AB";
const EYEBROW = "#7F9096";
const VERIFIED = "#7BEABE"; // --accent-foreground: the "Verified on Arc" green
const SURFACE = "rgba(255,255,255,0.05)";
const HAIRLINE = "rgba(255,255,255,0.10)";

const FIAT_SIGN: Record<string, string> = { USD: "$", EUR: "€" };

// Satori renders only the faces it is handed, so without these every fontWeight below is
// a silent no-op against next/og's single 400-weight fallback. Read once at MODULE scope
// so an unfurl never pays the disk read. What actually keeps these on disk in production
// is that next.config.mjs sets no `output: "standalone"`, so Railway runs the app from the
// deployed repo root and assets/ ships with it. Turning standalone output on would mean
// listing assets/fonts in `outputFileTracingIncludes`.
// Geist is the site face (see app/layout.tsx).
function loadFont(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    // A missing asset degrades to next/og's default face — never a 500 on an unfurl.
    return null;
  }
}

const GEIST_REGULAR = loadFont(join(process.cwd(), "assets/fonts/Geist-Regular.ttf"));
const GEIST_BOLD = loadFont(join(process.cwd(), "assets/fonts/Geist-Bold.ttf"));

const FONTS = [
  GEIST_REGULAR &&
    { name: "Geist", data: GEIST_REGULAR, weight: 400 as const, style: "normal" as const },
  GEIST_BOLD &&
    { name: "Geist", data: GEIST_BOLD, weight: 700 as const, style: "normal" as const },
].filter((f): f is NonNullable<typeof f> => f !== null);

// Only claim the family when it actually loaded, so the degraded path isn't asking
// Satori for a face it doesn't have.
const FONT_FAMILY = FONTS.length > 0 ? "Geist" : undefined;

// Outgoing cache for the PNG itself. With no explicit header next/og stamps its own
// `immutable, max-age=31536000` default in production, which would pin whatever this
// route happened to render on a cold start as the link's permanent public card.
// (`revalidate` above only governs Next's internal route cache, not this header.)
const PROOF_CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";
// A degraded render is a symptom, not a result — never let one get cached anywhere, so
// the next fetch re-reads from chain and self-heals.
const FALLBACK_CACHE = "no-store, max-age=0, must-revalidate";

// The card draws through Geist alone (no fallback family is bundled), so glyphs outside
// its latin coverage would come out as tofu. periodStart/periodEnd are only length-capped
// strings on write and monthLabel() passes anything non-"YYYY-MM" straight through, so
// strip to the covered range before rendering. ("$", "€", "…" and "·" are all inside it;
// the verify page's "→" is not, hence periodText().)
const SAFE_GLYPHS =
  /[^\u0020-\u007E\u00A0-\u00FF\u2013\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g;

function safeText(value: string, max: number): string {
  const clean = value.replace(SAFE_GLYPHS, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** "0", "0.00" — a formatted figure that carries no value. */
const ZERO_FIGURE = /^0(\.0+)?$/;

/** formatAmount's 2-decimal default rounds anything under a cent away to "0". The app UI
 *  can live with that next to its per-tx list; the card is a standalone headline, so
 *  widen the precision below one whole unit and let the caller reject a figure that still
 *  formats as zero. (Callers elsewhere keep the 2-decimal default untouched.) */
function cardFigure(amount: bigint, decimals: number): string {
  const whole = 10n ** BigInt(decimals);
  return formatAmount(amount, decimals, amount < whole ? 6 : 2);
}

export default async function OpengraphImage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const d = await loadDisclosure(params.id);
    // Unknown id, corrupt record, or one that would fan out past the disclosure cap:
    // show the generic card rather than a partial (i.e. wrong) total. `droppedTx` is the
    // same class of defect as a failed read below — the row lost hashes to the TX_HASH
    // filter, so any total we could draw is missing payments the owner disclosed.
    if (
      !d ||
      d.txHashes.length === 0 ||
      d.txHashes.length > MAX_DISCLOSURE_TX ||
      d.droppedTx > 0
    ) {
      return genericCard();
    }

    const result = await recompute(
      serverClient(),
      d.address as Address,
      d.txHashes,
    );
    // Fail closed. Nothing resolved on chain is a failed read, not an income of zero;
    // and a total missing even one disclosed tx (an Arc RPC rate-limit is enough) is an
    // UNDERSTATED figure. The verify page has room to caveat a partial recompute, this
    // card does not — so a partial proof is not a proof.
    if (
      result.verifiedCount === 0 ||
      result.totals.length === 0 ||
      result.failedCount > 0 ||
      result.overCap > 0
    ) {
      return genericCard();
    }

    return proofCard(d, result);
  } catch {
    // Any DB / RPC / parse failure degrades to the brand card. A broken unfurl is worse
    // than a generic one, and a half-read proof is worse than both.
    return genericCard();
  }
}

function proofCard(d: LoadedDisclosure, result: RecomputeResult) {
  // Mirrors components/verify-view.tsx: `fields` is an allow-list, so anything the
  // owner didn't tick is simply absent here (not even as a "hidden" placeholder).
  // Only the dates: the free-text `label` is NOT published here, because the toggle
  // gating this line promises "Show the date range" (FIELD_OPTIONS in
  // components/share-builder.tsx) — consent for a period is not consent for a caption.
  const period = d.fields.has("period") ? safeText(periodText(d), 46) : null;

  // Amounts are ungated by contract: FIELD_OPTIONS (components/share-builder.tsx) has no
  // amounts toggle because the share builder promises the total and its backing txs are
  // ALWAYS shown — that is what makes the proof independently verifiable. Same contract
  // as components/verify-view.tsx, which also renders totals unconditionally.
  const amounts = result.totals.map((t) => {
    const figure = cardFigure(t.amount, t.decimals);
    return { symbol: t.symbol, figure, text: `${FIAT_SIGN[t.fiat] ?? ""}${figure}` };
  });
  // A headline of "$0" on a public card is indistinguishable from a failed read, so
  // refuse to draw one at all rather than publish an ambiguous proof.
  if (amounts.some((a) => ZERO_FIGURE.test(a.figure))) {
    return genericCard();
  }

  // Step the headline down for a two-currency stack or a very long figure, so the
  // number can never run off the canvas or crowd the header.
  const longest = Math.max(...amounts.map((a) => a.text.length));
  const amountSize =
    amounts.length > 1 ? (longest > 12 ? 44 : 54) : longest > 12 ? 62 : 82;

  const chips: { value: string; label: string }[] = [];
  if (d.fields.has("count")) {
    chips.push({
      value: String(result.verifiedCount),
      label: result.verifiedCount === 1 ? "payment" : "payments",
    });
  }
  if (d.fields.has("clients")) {
    // Only ever the count — client names from memos never reach the card. Zero means
    // no payment carried a client memo, which reads as a broken figure at card size,
    // so the chip is dropped rather than shown as "0".
    const clients = new Set(
      result.txs.map((t) => t.memo?.client).filter(Boolean),
    ).size;
    if (clients > 0) {
      chips.push({ value: String(clients), label: clients === 1 ? "client" : "clients" });
    }
  }
  chips.push({ value: "100%", label: "on-chain" });
  if (d.fields.has("wallet")) {
    chips.push({ value: shorten(d.address, 4), label: "wallet" });
  }

  return render(
    <Shell badge="Verified on Arc" footnote="Recomputed live from Arc, not a database.">
      <div
        style={{
          display: "flex",
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "0.18em",
          color: EYEBROW,
        }}
      >
        VERIFIED INCOME
      </div>

      {period ? (
        <div
          style={{
            display: "flex",
            marginTop: "12px",
            fontSize: "32px",
            color: SECONDARY,
          }}
        >
          {period}
        </div>
      ) : null}

      {/* Per-token totals, never summed across currencies (no FX guesswork). */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "22px" }}>
        {amounts.map((a, i) => (
          <div
            key={a.symbol}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginTop: i === 0 ? "0px" : "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: `${amountSize}px`,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: HEADLINE,
              }}
            >
              {a.text}
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: "18px",
                padding: "8px 18px",
                borderRadius: "999px",
                backgroundColor: SURFACE,
                border: `1px solid ${HAIRLINE}`,
                fontSize: "24px",
                fontWeight: 600,
                color: SECONDARY,
              }}
            >
              {a.symbol}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          marginTop: "26px",
        }}
      >
        {chips.map((c) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginRight: "14px",
              padding: "10px 20px",
              borderRadius: "999px",
              backgroundColor: SURFACE,
              border: `1px solid ${HAIRLINE}`,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: "25px",
                fontWeight: 600,
                color: CHIP_TEXT,
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: "9px",
                fontSize: "23px",
                color: BODY,
              }}
            >
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </Shell>,
    PROOF_CACHE,
  );
}

/** Branded fallback: never leaks a figure, never 404s an unfurl. */
function genericCard() {
  return render(
    <Shell badge={null} footnote="Proof-of-income, recomputed from Arc.">
      <div
        style={{
          display: "flex",
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "0.18em",
          color: EYEBROW,
        }}
      >
        POWERED BY ARC TRANSACTION MEMOS
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          marginTop: "18px",
          fontSize: "70px",
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 1.05,
        }}
      >
        <div style={{ display: "flex", color: HEADLINE, marginRight: "22px" }}>
          Income proof from
        </div>
        <div
          style={{
            display: "flex",
            color: "transparent",
            backgroundImage: BRAND,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
          }}
        >
          Arc
        </div>
        <div style={{ display: "flex", color: HEADLINE }}>.</div>
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: "830px",
          marginTop: "22px",
          fontSize: "28px",
          lineHeight: 1.4,
          color: BODY,
        }}
      >
        Open the link to recompute every figure live from Arc on-chain data. Kred
        stores no amounts.
      </div>
    </Shell>,
    FALLBACK_CACHE,
  );
}

/** Shared canvas: ambient wash, brand header, and the trust footer. */
function Shell({
  badge,
  footnote,
  children,
}: {
  badge: string | null;
  footnote: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        backgroundColor: CANVAS,
        padding: "56px 72px",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Ambient wash. linear-gradient only — Satori can't parse radial-gradient. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "0px",
          left: "0px",
          right: "0px",
          bottom: "0px",
          backgroundImage: WASH,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <KMark tile={64} font={39} />
          <div
            style={{
              display: "flex",
              marginLeft: "20px",
              fontSize: "44px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: HEADLINE,
            }}
          >
            Kred
          </div>
        </div>

        {badge ? (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              padding: "12px 24px",
              borderRadius: "999px",
              backgroundColor: "rgba(49,219,144,0.08)",
              border: "1px solid rgba(49,219,144,0.28)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "12px",
                height: "12px",
                borderRadius: "999px",
                backgroundImage: BRAND,
              }}
            />
            <div
              style={{
                display: "flex",
                marginLeft: "12px",
                fontSize: "24px",
                fontWeight: 600,
                color: VERIFIED,
              }}
            >
              {badge}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `1px solid ${HAIRLINE}`,
          paddingTop: "24px",
        }}
      >
        <div style={{ display: "flex", fontSize: "24px", color: BODY }}>
          {footnote}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "24px",
            fontWeight: 600,
            color: SECONDARY,
          }}
        >
          kred.today
        </div>
      </div>
    </div>
  );
}

/** Brand mark. components/logo.tsx draws a real split-stroke K, but that needs an SVG
 *  gradient <defs> Satori can't resolve — so the card uses the gradient tile instead. */
function KMark({ tile, font }: { tile: number; font: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${tile}px`,
        height: `${tile}px`,
        borderRadius: `${Math.round(tile * 0.26)}px`,
        backgroundImage: BRAND,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: `${font}px`,
          fontWeight: 700,
          color: "#08110D",
        }}
      >
        K
      </div>
    </div>
  );
}

/** next/og merges `options.headers` over its own defaults, so passing cache-control here
 *  is what stops the default `immutable, max-age=31536000` from sticking. */
function render(node: ReactElement, cache: string) {
  return new ImageResponse(node, {
    ...size,
    fonts: FONTS.length > 0 ? FONTS : undefined,
    headers: { "cache-control": cache },
  });
}
