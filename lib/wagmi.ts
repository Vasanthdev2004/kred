import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { arcTestnet } from "@/config/arc";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();

/**
 * The note that used to sit here said a placeholder id "only disables WC-based
 * wallets". That was wrong, and believing it is why this survived in production:
 * RainbowKit still OFFERS every WalletConnect wallet, the relay rejects the bogus
 * id, and the button does nothing. No error, no fallback — just a dead tap.
 *
 * Phones have no injected wallet, so that meant no mobile user could connect at all,
 * while desktop MetaMask kept working and hid it from everyone testing.
 *
 * The id is public (it ships in the client bundle), so it is not a secret. Free at
 * https://cloud.reown.com.
 */
if (!WC_PROJECT_ID && process.env.NODE_ENV !== "production") {
  console.warn(
    "[kred] NEXT_PUBLIC_WC_PROJECT_ID is unset — WalletConnect wallets will be " +
      "offered but cannot connect. Mobile wallets are effectively dead.",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "Kred",
  appDescription: "Verifiable proof-of-income on Arc",
  appUrl: "https://kred.today",
  appIcon: "https://kred.today/icon.svg",
  // getDefaultConfig requires a non-empty string, so the placeholder stays — but it
  // is now the visibly-broken path, not something a comment describes as fine.
  projectId: WC_PROJECT_ID || "KRED_DEMO",
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
