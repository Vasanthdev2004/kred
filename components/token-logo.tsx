import { TokenUSDC, TokenEURC } from "@web3icons/react";
import { cn } from "@/lib/utils";
import type { TokenSymbol } from "@/lib/tokens";

const ICON = { USDC: TokenUSDC, EURC: TokenEURC } as const;

/**
 * Real branded token coin (USDC / EURC) from @web3icons — the authentic brand
 * marks, used everywhere via TokenBadge. `animated` overlays a glint that travels
 * around the rim (landing memo showcase).
 */
export function TokenLogo({
  symbol,
  className,
  animated = false,
}: {
  symbol: TokenSymbol;
  className?: string;
  animated?: boolean;
}) {
  const Icon = ICON[symbol];
  if (!animated) {
    return <Icon variant="branded" className={cn("shrink-0", className)} />;
  }
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Icon variant="branded" className="size-full" />
      <svg
        viewBox="0 0 40 40"
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      >
        <circle
          cx="20"
          cy="20"
          r="18.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="7 110"
          opacity="0.85"
          className="[animation:spin_3.5s_linear_infinite] motion-reduce:[animation:none]"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </svg>
    </span>
  );
}
