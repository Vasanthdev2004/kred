"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Github,
  Link2,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { FluidBackground } from "./fluid-background";
import { WordReveal } from "./word-reveal";
import { PassportCard } from "./passport-card";
import { Reveal } from "./reveal";
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
          <Reveal>
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
          </Reveal>

          <Reveal className="relative mx-auto w-full max-w-sm" delay={120}>
            <div className="absolute -inset-8 -z-10 rounded-full bg-brand/20 blur-3xl" />
            <div className="animate-float">
              <PassportCard />
            </div>
            <p className="mt-4 text-center text-xs text-white/35">
              Example proof — the real one is recomputed from your Arc history.
            </p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------- memo anatomy (Arc-native) */}
      <section className="relative px-5 py-24">
        <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 h-72 bg-brand/[0.05] blur-3xl" />
        <div className="mx-auto max-w-5xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-brand-3">
              The Arc-native part
            </p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
              The memo travels <span className="text-gradient">with the money</span>
            </h2>
            <p className="mt-4 text-white/55">
              Arc&apos;s Memo contract wraps the transfer and emits structured context
              in the same transaction — invoice, project, period. Not a note in our
              database. On-chain, forever, verifiable by anyone.
            </p>
          </Reveal>

          <Reveal delay={140} className="mx-auto mt-12 max-w-3xl">
            <div className="gradient-border overflow-hidden rounded-xl bg-[#0a0f14] shadow-glow">
              {/* terminal chrome */}
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-3 font-mono text-xs text-white/40">
                  payslip — pay with memo
                </span>
                <span className="ml-auto rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[10px] text-brand-3">
                  Arc Testnet
                </span>
              </div>
              {/* the call */}
              <div className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
                <div className="text-white/40">
                  # client opens your request link and pays
                </div>
                <div className="mt-2">
                  <span className="text-brand-3">Memo.memo</span>
                  <span className="text-white/60">(</span>
                </div>
                <div className="pl-5">
                  <span className="text-white/50">target:</span>{" "}
                  <span className="text-white">USDC</span>{" "}
                  <span className="text-white/30">· 0x3600…0000</span>
                </div>
                <div className="pl-5">
                  <span className="text-white/50">data:</span>{" "}
                  <span className="text-white">transfer(you, 1,250.00)</span>
                </div>
                <div className="pl-5">
                  <span className="text-white/50">memoId:</span>{" "}
                  <span className="text-white/70">
                    keccak256(&quot;2026-03:INV-2026-014&quot;)
                  </span>
                </div>
                <div className="pl-5">
                  <span className="text-white/50">memo:</span>{" "}
                  <span className="text-white/60">{"{"}</span>
                </div>
                {[
                  ["client", "Acme Inc"],
                  ["project", "Website redesign"],
                  ["invoice", "INV-2026-014"],
                  ["period", "2026-03"],
                ].map(([k, v]) => (
                  <div key={k} className="pl-10">
                    <span className="text-brand-3">&quot;{k}&quot;</span>
                    <span className="text-white/40">: </span>
                    <span className="text-emerald-50/90">&quot;{v}&quot;</span>
                  </div>
                ))}
                <div className="pl-5 text-white/60">{"}"}</div>
                <div className="text-white/60">)</div>
                <div className="mt-4 flex items-center gap-2 text-brand-3">
                  <CheckCircle2 className="size-4" />
                  <span>settled in &lt;1s · payer preserved via CALL_FROM</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-brand-3">
                  <CheckCircle2 className="size-4" />
                  <span>lands in your Payslip already categorized</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- trust band */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.02] px-5 py-14">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center lg:grid-cols-4">
          {[
            ["<1s", "deterministic finality on Arc"],
            ["USDC", "gas token — no volatile fees"],
            ["2", "stablecoins indexed · USDC + EURC"],
            ["0", "trust required — verifiers recompute"],
          ].map(([big, small], i) => (
            <Reveal key={small} delay={i * 90}>
              <div className="font-mono text-3xl font-semibold text-white sm:text-4xl">
                {big}
              </div>
              <div className="mt-1.5 text-xs text-white/45 sm:text-sm">{small}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- final CTA */}
      <section className="relative overflow-hidden px-5 py-28 text-center">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(16,185,129,0.14),transparent_70%)]" />
        <Reveal className="mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-medium tracking-tight sm:text-5xl">
            Your income is already on-chain.
            <br />
            <span className="text-gradient">Make it provable.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-white/55">
            Connect a wallet, and every payment you&apos;ve received on Arc becomes
            evidence a bank can check.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ConnectButton label="Connect wallet — it's free" />
            <a
              href="https://github.com/Vasanthdev2004/payslip"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
            >
              <Github className="size-4" />
              Read the source
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
