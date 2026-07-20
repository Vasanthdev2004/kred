import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shorten a hash/address for display: 0x1234…abcd */
export function shorten(value: string, chars = 4): string {
  if (!value) return "";
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}

/** Format a token amount (bigint, base units) to a human number string. */
export function formatAmount(value: bigint, decimals: number, maxFrac = 2): string {
  const raw = formatUnits(value, decimals);
  const n = Number(raw);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

/** Format as a fiat-style currency string. */
export function formatFiat(amount: number, currency: "USD" | "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
