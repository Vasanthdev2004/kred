"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BadgeCheck, FileText, Link2, ShieldCheck, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Tags,
    title: "Auto-categorized income",
    body: "Every incoming USDC/EURC payment, organized by client & project from its Arc Transaction Memo.",
  },
  {
    icon: FileText,
    title: "Income statements + PDF",
    body: "Generate a period statement where every figure is backed by an on-chain tx hash.",
  },
  {
    icon: Link2,
    title: "Shareable verify links",
    body: "Reveal only what you choose. A bank or landlord re-derives the numbers from Arc — no trust in you required.",
  },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid opacity-[0.35]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 to-transparent" />

      <div className="container flex flex-col items-center py-20 text-center sm:py-28">
        <Badge variant="success" className="mb-6">
          <BadgeCheck className="size-3.5" />
          Built on Arc · Powered by Transaction Memos
        </Badge>

        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Prove what you earned.{" "}
          <span className="text-primary">On-chain.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Freelancers paid in stablecoins have no payslip. Payslip turns your Arc
          payment history into a verifiable, selectively-shareable{" "}
          <span className="text-foreground">proof of income</span> — one a bank,
          landlord, or client can independently confirm is real.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
          <ConnectButton label="Connect wallet to start" />
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            The chain is the source of truth — never our database.
          </span>
        </div>

        <div className="mt-16 grid w-full max-w-4xl gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
