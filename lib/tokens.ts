import { getAddress, type Address } from "viem";
import { ARC } from "@/config/arc";

export type TokenSymbol = "USDC" | "EURC";
export type Fiat = "USD" | "EUR";

export interface TokenMeta {
  symbol: TokenSymbol;
  name: string;
  address: Address;
  decimals: number; // ERC-20 interface decimals
  fiat: Fiat;
}

export const TOKENS: TokenMeta[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: getAddress(ARC.contracts.usdc),
    decimals: 6,
    fiat: "USD",
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    address: getAddress(ARC.contracts.eurc),
    decimals: 6,
    fiat: "EUR",
  },
];

const BY_ADDRESS = new Map<string, TokenMeta>(
  TOKENS.map((t) => [t.address.toLowerCase(), t]),
);

export function tokenByAddress(address: string): TokenMeta | undefined {
  return BY_ADDRESS.get(address.toLowerCase());
}

export function tokenBySymbol(symbol: TokenSymbol): TokenMeta {
  const t = TOKENS.find((x) => x.symbol === symbol);
  if (!t) throw new Error(`Unknown token ${symbol}`);
  return t;
}

export const TOKEN_ADDRESSES = TOKENS.map((t) => t.address);
