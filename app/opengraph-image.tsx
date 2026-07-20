import { ImageResponse } from "next/og";

// Route segment config
export const alt = "Kred — Verifiable proof-of-income on Arc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default Node runtime (no `runtime = "edge"`) for reliability.
// FULLY self-contained: no remote fonts, no remote images, no fetch().
// Uses next/og's built-in default font.

// Brand gradient used for accent text/marks.
const gradientText = {
  backgroundImage: "linear-gradient(120deg, #31DB90 0%, #1FC7E6 100%)",
  backgroundClip: "text" as const,
  WebkitBackgroundClip: "text" as const,
  color: "transparent",
};

/** Kred K-mark inside a rounded tile (matches app/icon.svg). */
function KTile({ dim, id }: { dim: number; id: string }) {
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={id}
          x1="28"
          y1="24"
          x2="76"
          y2="80"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#31DB90" />
          <stop offset="1" stopColor="#1FC7E6" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="#0E1318" />
      <g
        fill={`url(#${id})`}
        stroke={`url(#${id})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        <rect x="27" y="24" width="16" height="52" rx="5" strokeWidth="0" />
        <path d="M46 47 L62 24 L79 24 Z" />
        <path d="M46 53 L56 53 L79 76 L69 76 Z" />
      </g>
    </svg>
  );
}

/** Large translucent K watermark (no tile) for the right-side bleed. */
function KWatermark({ dim, id }: { dim: number; id: string }) {
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={id}
          x1="20"
          y1="16"
          x2="82"
          y2="84"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#31DB90" />
          <stop offset="1" stopColor="#1FC7E6" />
        </linearGradient>
      </defs>
      <g
        fill={`url(#${id})`}
        stroke={`url(#${id})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        <rect x="25" y="23" width="16" height="54" rx="5" strokeWidth="0" />
        <path d="M44 47 L61 23 L79 23 Z" />
        <path d="M44 53 L55 53 L80 77 L69 77 Z" />
      </g>
    </svg>
  );
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0A0B0D",
          backgroundImage:
            "radial-gradient(1120px 560px at 8% -12%, rgba(49,219,144,0.22), transparent 58%), radial-gradient(1040px 660px at 112% 120%, rgba(31,199,230,0.20), transparent 55%)",
          padding: "62px 76px",
        }}
      >
        {/* Right-side K watermark bleed (painted first = behind content) */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "78px",
            right: "-96px",
            opacity: 0.09,
          }}
        >
          <KWatermark dim={620} id="kred-wm" />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <KTile dim={72} id="kred-logo" />
            <div
              style={{
                display: "flex",
                fontSize: "46px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#F0F5F5",
              }}
            >
              Kred
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
              padding: "12px 22px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "12px",
                height: "12px",
                borderRadius: "999px",
                backgroundImage:
                  "linear-gradient(120deg, #31DB90 0%, #1FC7E6 100%)",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "22px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "#B7C4C8",
              }}
            >
              Built on Arc
            </div>
          </div>
        </div>

        {/* Main */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            gap: "34px",
          }}
        >
          {/* Editorial gradient rule */}
          <div
            style={{
              display: "flex",
              width: "8px",
              borderRadius: "999px",
              backgroundImage:
                "linear-gradient(180deg, #31DB90 0%, #1FC7E6 100%)",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "22px",
            }}
          >
            {/* Eyebrow */}
            <div
              style={{
                display: "flex",
                fontSize: "21px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                color: "#7F9096",
              }}
            >
              PROOF-OF-INCOME · POWERED BY ARC TRANSACTION MEMOS
            </div>

            {/* Headline */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "76px",
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.04,
                  color: "#F0F5F5",
                }}
              >
                Verifiable proof-of-income
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-end",
                  fontSize: "76px",
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.04,
                }}
              >
                <div style={{ display: "flex", color: "#F0F5F5" }}>on&nbsp;</div>
                <div style={{ display: "flex", ...gradientText }}>Arc</div>
                <div style={{ display: "flex", color: "#F0F5F5" }}>.</div>
              </div>
            </div>

            {/* Supporting line */}
            <div
              style={{
                display: "flex",
                maxWidth: "780px",
                fontSize: "27px",
                fontWeight: 400,
                lineHeight: 1.4,
                color: "#98A6AB",
              }}
            >
              Turn on-chain stablecoin payments into a private, selectively
              shareable income record a bank or landlord can verify from chain.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "14px",
              padding: "14px 22px 14px 16px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <KTile dim={34} id="kred-chip" />
            <div
              style={{
                display: "flex",
                fontSize: "26px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "#EAF1F1",
              }}
            >
              kred.today
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
              padding: "13px 24px",
              borderRadius: "999px",
              backgroundColor: "rgba(49,219,144,0.06)",
              border: "1px solid rgba(49,219,144,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundImage:
                  "linear-gradient(120deg, #31DB90 0%, #1FC7E6 100%)",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "23px",
                fontWeight: 500,
                letterSpacing: "0.01em",
                color: "#B7C4C8",
              }}
            >
              Share a verify link · kred.today/verify/…
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
