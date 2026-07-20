import { cn } from "@/lib/utils";
import type { TokenSymbol } from "@/lib/tokens";

const STYLES: Record<TokenSymbol, string> = {
  USDC: "bg-[#2775CA] text-white",
  EURC: "bg-[#1AA3A3] text-white",
};

const GLYPH: Record<TokenSymbol, string> = { USDC: "$", EURC: "€" };

export function TokenBadge({
  symbol,
  size = "md",
  className,
}: {
  symbol: TokenSymbol;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold shadow-soft",
        size === "sm" ? "size-5 text-[11px]" : "size-8 text-sm",
        STYLES[symbol],
        className,
      )}
      aria-hidden
    >
      {GLYPH[symbol]}
    </span>
  );
}
