"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { LandingHero } from "@/components/landing-hero";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render the marketing hero on the server + first client paint to avoid a
  // hydration mismatch, then swap to the dashboard once the wallet is known.
  if (!mounted || !isConnected) return <LandingHero />;
  return <Dashboard />;
}
