"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { wagmiConfig } from "@/lib/wagmi";

const ACCENT = "#10b981"; // emerald-500, matches --primary

function RainbowKit({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const theme =
    resolvedTheme === "light"
      ? lightTheme({ accentColor: ACCENT, borderRadius: "large" })
      : darkTheme({ accentColor: ACCENT, borderRadius: "large" });
  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKit>{children}</RainbowKit>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
