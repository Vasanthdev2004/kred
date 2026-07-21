"use client";

import Jazzicon, { jsNumberForAddress } from "react-jazzicon";
import { cn } from "@/lib/utils";

/** MetaMask/OKX-style generative wallet identicon (Jazzicon) — deterministic from
 *  the address, clipped to a circle. Pass ring/shadow utilities via className. */
export function WalletAvatar({
  address,
  size = 48,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Jazzicon diameter={size} seed={jsNumberForAddress(address)} />
    </span>
  );
}
