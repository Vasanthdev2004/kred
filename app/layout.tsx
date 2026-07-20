import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Payslip — Verifiable proof-of-income on Arc",
  description:
    "Turn your on-chain stablecoin payment history on Arc into verifiable, selectively-shareable proof of income — powered by Arc Transaction Memos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans min-h-screen bg-background text-foreground">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
