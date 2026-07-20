import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { arcTestnet } from "@/config/arc";

/**
 * Injected wallets (MetaMask) work without a WalletConnect projectId; the placeholder
 * only disables WC-based wallets. Set NEXT_PUBLIC_WC_PROJECT_ID for the full list.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Kred",
  appDescription: "Verifiable proof-of-income on Arc",
  appUrl: "https://kred.today",
  appIcon: "https://kred.today/icon.svg",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "KRED_DEMO",
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
