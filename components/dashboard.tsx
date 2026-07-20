"use client";

import { useAccount } from "wagmi";
import { FileText, Link2, Send } from "lucide-react";
import { shorten } from "@/lib/utils";
import { explorerAddress } from "@/config/arc";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NetworkGuard } from "@/components/network-guard";
import { BalanceCards } from "@/components/balance-cards";

const NEXT_ACTIONS = [
  {
    icon: Send,
    title: "Request payment with memo",
    body: "Send a client a link that attaches an invoice/project memo to the payment.",
    milestone: "M3",
  },
  {
    icon: FileText,
    title: "Generate income statement",
    body: "Aggregate a period into a branded PDF, each figure backed by a tx hash.",
    milestone: "M4",
  },
  {
    icon: Link2,
    title: "Share a verify link",
    body: "Publish a selective-disclosure page a verifier can confirm against Arc.",
    milestone: "M5",
  },
];

export function Dashboard() {
  const { address } = useAccount();

  return (
    <>
      <NetworkGuard />
      <div className="container space-y-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Connected as{" "}
              {address ? (
                <a
                  href={explorerAddress(address)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-foreground hover:text-primary hover:underline"
                >
                  {shorten(address, 6)}
                </a>
              ) : (
                "—"
              )}
            </p>
          </div>
          <Badge variant="outline">Arc Testnet</Badge>
        </div>

        <BalanceCards />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your income
          </h2>
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
            <p className="font-medium">Income feed lands in M1.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Next milestone indexes every incoming USDC &amp; EURC payment to this
              wallet from Arc, decodes its Transaction Memo, and lists each with a
              verifiable tx hash.
            </p>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Coming next
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {NEXT_ACTIONS.map((a) => (
              <Card key={a.title} className="relative p-5">
                <Badge variant="muted" className="absolute right-3 top-3">
                  {a.milestone}
                </Badge>
                <a.icon className="size-6 text-primary" />
                <h3 className="mt-3 font-semibold">{a.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{a.body}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
