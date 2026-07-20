"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
