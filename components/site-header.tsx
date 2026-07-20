"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/**
 * App header for the connected (dashboard) experience. The disconnected landing
 * renders its own in-hero nav, so this stays hidden there.
 */
export function SiteHeader() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !isConnected) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="text-lg">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton
            accountStatus="address"
            chainStatus="icon"
            showBalance={false}
          />
        </div>
      </div>
    </header>
  );
}
