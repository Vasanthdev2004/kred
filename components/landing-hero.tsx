"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, FileText, Link2, ShieldCheck, Tags } from "lucide-react";
import { FluidBackground } from "./fluid-background";
import { WordReveal } from "./word-reveal";
import { PassportCard } from "./passport-card";
import { Logo } from "./logo";

const STEPS = [
  {
    icon: Tags,
    title: "Connect & index",
    body: "Every incoming USDC/EURC payment on Arc, pulled straight from chain and auto-organized by its Transaction Memo.",
  },
  {
    icon: FileText,
    title: "Generate a statement",
    body: "Aggregate any period into totals by client and category — then export a branded PDF where every figure cites its tx hash.",
  },
  {
    icon: Link2,
    title: "Share a verify link",
    body: "Reveal only what you choose. Anyone can re-derive the totals from Arc on-chain data. No trust in you required.",
  },
];

export function LandingHero() {
  return (
    <div className="dark relative bg-[#06090c] text-white">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 text-center">
        <FluidBackground className="absolute inset-0 z-0" />

        {/* legibility scrim + bottom fade into the next section */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "radial-gradient(120% 95% at 50% 42%, rgba(6,9,12,0.74) 0%, rgba(6,9,12,0.72) 22%, rgba(6,9,12,0.44) 54%, rgba(6,9,12,0.08) 100%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-b from-transparent to-[#06090c]" />

        {/* in-hero nav */}
        <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="text-white">
            <Logo className="text-[1.05rem]" />
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="#how"
              className="hidden text-sm text-white/70 transition-colors hover:text-white sm:block"
            >
              How it works
            </a>
            <ConnectButton
              accountStatus="address"
              chainStatus="none"
              showBalance={false}
            />
          </div>
        </header>

        {/* content column */}
        <div className="relative z-10 flex max-w-3xl flex-col items-center">
          <span
            className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md"
            style={{ animationDelay: "80ms" }}
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-3 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-3" />
            </span>
            Built on Arc · Powered by Transaction Memos
          </span>

          <WordReveal
            as="h1"
            text="Prove what you earned — onchain."
            className="mt-6 max-w-3xl text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.5rem]"
            baseDelay={220}
            stagger={85}
            duration={720}
            fromY={26}
          />

          <WordReveal
            as="p"
            text="Turn your Arc stablecoin payments into verifiable proof of income. Every figure is backed by a transaction a bank, landlord, or client can check themselves."
            className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg"
            baseDelay={1000}
            stagger={16}
            duration={600}
            fromY={14}
          />

          <div
            className="animate-rise mt-9 flex flex-col items-center gap-4 sm:flex-row"
            style={{ animationDelay: "1350ms" }}
          >
            <ConnectButton label="Connect wallet to start" />
            <a
              href="#how"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              See how it works
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <div
            className="animate-rise mt-8 inline-flex items-center gap-2 text-xs text-white/45"
            style={{ animationDelay: "1550ms" }}
          >
            <ShieldCheck className="size-3.5 text-brand-3" />
            The chain is the source of truth — never our database.
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- how it works + proof */}
      <section id="how" className="relative px-5 py-24 sm:py-32">
        <div className="mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-brand-3">How it works</p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
              A payslip your bank can verify itself
            </h2>
            <p className="mt-4 max-w-md text-white/55">
              No product turns on-chain payment history into disclosable income
              proof. Payslip is that credential layer — Arc-native, and trustless
              by construction.
            </p>

            <ol className="mt-9 space-y-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] font-mono text-sm text-brand-3">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2 font-medium">
                      <s.icon className="size-4 text-brand-3" />
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm text-white/55">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-8 -z-10 rounded-full bg-brand/20 blur-3xl" />
            <div className="animate-float">
              <PassportCard />
            </div>
            <p className="mt-4 text-center text-xs text-white/35">
              Example proof — the real one is recomputed from your Arc history.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
