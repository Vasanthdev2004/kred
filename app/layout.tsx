import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://kred.today"),
  title: {
    default: "Kred — Verifiable proof-of-income on Arc",
    template: "%s · Kred",
  },
  description:
    "Turn your on-chain stablecoin payment history on Arc into verifiable, selectively-shareable proof of income — powered by Arc Transaction Memos.",
  applicationName: "Kred",
  keywords: [
    "Kred",
    "proof of income",
    "income verification",
    "Arc",
    "Circle",
    "stablecoin",
    "on-chain",
    "Arc Transaction Memos",
    "verifiable credentials",
    "payslip",
    "verify income",
  ],
  authors: [{ name: "Kred" }],
  creator: "Kred",
  publisher: "Kred",
  openGraph: {
    type: "website",
    siteName: "Kred",
    url: "/",
    title: "Kred — Verifiable proof-of-income on Arc",
    description:
      "Turn your on-chain stablecoin payment history on Arc into verifiable, selectively-shareable proof of income — powered by Arc Transaction Memos.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kred — Verifiable proof-of-income on Arc",
    description:
      "Turn your on-chain stablecoin payment history on Arc into verifiable, selectively-shareable proof of income — powered by Arc Transaction Memos.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="grain min-h-screen bg-background font-sans text-foreground">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
