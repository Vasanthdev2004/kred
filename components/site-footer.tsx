"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ExternalLink, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { ARC } from "@/config/arc";
import { Logo } from "./logo";

const COLUMNS: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Dashboard", href: "/" },
      { label: "Request payment", href: "/request" },
      { label: "Income statement", href: "/statement" },
      { label: "Share a verify link", href: "/share" },
    ],
  },
  {
    title: "Arc",
    links: [
      { label: "Arc docs", href: "https://docs.arc.io", external: true },
      { label: "Block explorer", href: ARC.explorerUrl, external: true },
      { label: "Testnet faucet", href: ARC.faucetUrl, external: true },
    ],
  },
  {
    title: "Open source",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/Vasanthdev2004/kred",
        external: true,
      },
      {
        label: "How it's built",
        href: "https://github.com/Vasanthdev2004/kred/blob/main/docs/arc-notes.md",
        external: true,
      },
    ],
  },
];

export function SiteFooter() {
  // The disconnected landing is dark-forced; match it so the footer doesn't
  // flash light under a black page in light theme.
  const { isConnected } = useAccount();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onLanding = pathname === "/" && (!mounted || !isConnected);

  return (
    <footer
      className={cn(
        "border-t border-border/60 bg-background",
        onLanding && "dark bg-[#06090c] text-foreground",
      )}
    >
      <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <Logo className="text-base" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Verifiable proof-of-income for onchain freelancers. Every figure backed
            by an Arc transaction, never our word.
          </p>
          <a
            href="https://github.com/Vasanthdev2004/kred"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="size-4" />
            Star on GitHub
          </a>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {col.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="container flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-muted-foreground">
          <span>© 2026 Kred · MIT licensed · built on Arc testnet</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-3 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-3" />
            </span>
            The chain is the source of truth
          </span>
        </div>
      </div>
    </footer>
  );
}
