"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowRight, ExternalLink, FileText, Link2, Send } from "lucide-react";
import { addressGradient, shorten } from "@/lib/utils";
import { explorerAddress } from "@/config/arc";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { NetworkGuard } from "@/components/network-guard";
import { BalanceCards } from "@/components/balance-cards";
import { IncomeSection } from "@/components/income";

const ACTIONS = [
  {
    icon: Send,
    title: "Request payment with memo",
    body: "Send a client a link that attaches an invoice/project memo to the payment — so it arrives here already categorized.",
    href: "/request",
  },
  {
    icon: FileText,
    title: "Generate income statement",
    body: "Aggregate a period into totals + a monthly chart, and export a branded PDF backed by tx hashes.",
    href: "/statement",
  },
  {
    icon: Link2,
    title: "Share a verify link",
    body: "Publish a page where a bank or landlord recomputes your income from Arc themselves — no trust required.",
    href: "/share",
  },
];

export function Dashboard() {
  const { address } = useAccount();

  return (
    <>
      <NetworkGuard />
      <div className="container space-y-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {address && (
              <span
                aria-hidden
                className="size-12 shrink-0 rounded-full shadow-soft ring-2 ring-border"
                style={{ background: addressGradient(address) }}
              />
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Your income passport
              </h1>
              {address && (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="font-mono">{shorten(address, 6)}</span>
                  <CopyButton value={address} label="Copy address" />
                  <a
                    href={explorerAddress(address)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View on explorer"
                    className="rounded-md p-1 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-3 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-3" />
            </span>
            Arc Testnet
          </Badge>
        </div>

        <BalanceCards />

        <IncomeSection />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Get paid &amp; prove it
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a) => (
              <Link key={a.title} href={a.href} className="block">
                <Card className="gradient-border hairline-top group relative h-full overflow-hidden p-6 transition-colors hover:bg-secondary/30">
                  <div className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-brand/10 blur-3xl" />
                  <span className="relative flex size-11 items-center justify-center rounded-lg bg-accent text-primary">
                    <a.icon className="size-5" />
                  </span>
                  <h3 className="relative mt-3 flex items-center gap-1.5 font-semibold">
                    {a.title}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </h3>
                  <p className="relative mt-1.5 text-sm text-muted-foreground">
                    {a.body}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
