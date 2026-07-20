import { ImageResponse } from "next/og";

// Route segment config
export const alt = "Kred — Verifiable proof-of-income on Arc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Self-contained (no remote fonts/images) AND uses only Satori-safe CSS:
// solid colors, linear-gradient, flexbox, border-radius, background-clip:text.
// Deliberately NO radial-gradient and NO inline-SVG gradient fills — Satori's
// parser rejects `radial-gradient(<size> at <pos>, …)` and gradient <defs>,
// which is what failed the Railway build. Renders on Linux (Railway).

const BRAND = "linear-gradient(120deg, #31DB90 0%, #1FC7E6 100%)";

/** Brand mark: a gradient tile with a dark "K". SVG-free for Satori safety. */
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
          padding: "62px 76px",
        }}
      >
        {/* Ambient corner wash (linear-gradient — Satori-safe) */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "0px",
            left: "0px",
            right: "0px",
            bottom: "0px",
            backgroundImage:
              "linear-gradient(125deg, rgba(49,219,144,0.16) 0%, rgba(49,219,144,0) 34%, rgba(31,199,230,0) 66%, rgba(31,199,230,0.16) 100%)",
          }}
        />

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
            <KMark tile={72} font={44} />
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
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
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
                fontSize: "22px",
                fontWeight: 600,
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

          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Eyebrow */}
            <div
              style={{
                display: "flex",
                fontSize: "21px",
                fontWeight: 600,
                letterSpacing: "0.16em",
                color: "#7F9096",
                marginBottom: "22px",
              }}
            >
              PROOF-OF-INCOME · POWERED BY ARC TRANSACTION MEMOS
            </div>

            {/* Headline */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: "76px",
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                  color: "#F0F5F5",
                }}
              >
                Verifiable proof-of-income
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  fontSize: "76px",
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                }}
              >
                <div style={{ display: "flex", color: "#F0F5F5" }}>on&nbsp;</div>
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
                <div style={{ display: "flex", color: "#F0F5F5" }}>.</div>
              </div>
            </div>

            {/* Supporting line */}
            <div
              style={{
                display: "flex",
                maxWidth: "800px",
                fontSize: "27px",
                lineHeight: 1.4,
                color: "#98A6AB",
                marginTop: "24px",
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
              padding: "13px 22px 13px 14px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <KMark tile={34} font={21} />
            <div
              style={{
                display: "flex",
                fontSize: "26px",
                fontWeight: 600,
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
              backgroundColor: "rgba(49,219,144,0.07)",
              border: "1px solid rgba(49,219,144,0.24)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundImage: BRAND,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "23px",
                fontWeight: 500,
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
