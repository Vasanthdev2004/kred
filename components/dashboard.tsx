"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { usePreviewAddress } from "@/lib/preview";
import { ArrowRight, ExternalLink, FileText, Link2, Send } from "lucide-react";
import { shorten } from "@/lib/utils";
import { explorerAddress } from "@/config/arc";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { WalletAvatar } from "@/components/wallet-avatar";
import { CopyButton } from "@/components/copy-button";
import { NetworkGuard } from "@/components/network-guard";
import { BalanceCards } from "@/components/balance-cards";
import { IncomeSection } from "@/components/income";
import { IncomeHeatmap } from "@/components/income-heatmap";
import { IncomeHealth } from "@/components/income-health";
import { RecurringClients } from "@/components/recurring-clients";
import { AgentLauncher } from "@/components/agent";
import { useIncome } from "@/hooks/use-income";
import { useTags } from "@/hooks/use-tags";

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
  const { address: wagmiAddress } = useAccount();
  const preview = usePreviewAddress();
  const address = wagmiAddress ?? preview;
  // Shared with IncomeSection via react-query's cache, so the track-record
  // panels below cost no extra reads.
  const { data: income, isLoading, isError } = useIncome();
  const { data: tags } = useTags();

  return (
    <>
      <NetworkGuard />
      <div className="container space-y-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {address && (
              <WalletAvatar
                address={address}
                size={48}
                className="shadow-soft ring-2 ring-border"
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

        {/* The track record: not just what arrived, but how steady it is. */}
        <IncomeHeatmap
          payments={income?.payments}
          isLoading={isLoading}
          isError={isError}
        />

        {/* Both run full width: five figures per token need the room, and
            squeezing them into a half column overlaps the larger amounts. */}
        <IncomeHealth
          payments={income?.payments}
          tags={tags}
          isLoading={isLoading}
          isError={isError}
        />

        <RecurringClients />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Get paid &amp; prove it
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a) => (
              <Link key={a.title} href={a.href} className="block">
                <GlassCard interactive className="h-full p-6">
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
                </GlassCard>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Only on the connected dashboard: with no wallet there is no income to read. */}
      <AgentLauncher />
    </>
  );
}
