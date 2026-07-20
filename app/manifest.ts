import type { MetadataRoute } from "next";

/** PWA / add-to-home-screen identity. start_url stays relative — no hardcoded
 *  domain needed; icons reference the auto-served app/icon.svg. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kred — Verifiable proof-of-income on Arc",
    short_name: "Kred",
    description:
      "Turn your on-chain stablecoin payment history on Arc into verifiable, selectively-shareable proof of income.",
    start_url: "/",
    display: "standalone",
    background_color: "#090d11",
    theme_color: "#090d11",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
  };
}
