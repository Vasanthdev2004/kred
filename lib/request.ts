/**
 * Payment requests are stateless — encoded entirely in the /pay URL, so a freelancer
 * can share one without any backend record. The payer page decodes it and sends USDC
 * through the Memo contract, attaching this context as the on-chain memo.
 */
import { getAddress, isAddress, type Address } from "viem";
import type { TokenSymbol } from "@/lib/tokens";

export interface PaymentRequest {
  to: Address;
  token: TokenSymbol;
  amount: string; // human units, e.g. "1250.00"
  client?: string;
  project?: string;
  invoice?: string;
  period?: string;
  category?: string;
  note?: string;
  /** Opaque per-request salt. URL-only, never part of the memo — it exists so two
   *  identical invoices do not derive the same escrow id. */
  nonce?: string;
}

const MEMO_KEYS = [
  "client",
  "project",
  "invoice",
  "period",
  "category",
  "note",
] as const;

const AMOUNT_RE = /^\d+(\.\d+)?$/;

/** Build the shareable /pay path for a request (empty fields omitted).
 *
 *  `nonce` rides in the URL but NOT in the memo: it exists only to make each request
 *  a distinct escrow. Without it, re-issuing the same invoice number for the same
 *  amount derives the same escrow id, and the payer's page shows the PREVIOUS
 *  escrow — reporting "settled" for an invoice nobody has paid. */
export function buildRequestPath(r: PaymentRequest): string {
  const p = new URLSearchParams();
  p.set("to", r.to);
  p.set("token", r.token);
  p.set("amount", r.amount);
  for (const k of MEMO_KEYS) {
    const v = r[k];
    if (v && v.trim()) p.set(k, v.trim());
  }
  if (r.nonce && r.nonce.trim()) p.set("n", r.nonce.trim());
  return `/pay?${p.toString()}`;
}

/** Parse + validate request params from a URLSearchParams; null if malformed. */
export function parseRequest(sp: URLSearchParams): PaymentRequest | null {
  const to = sp.get("to");
  const token = sp.get("token");
  const amount = sp.get("amount");

  if (!to || !isAddress(to)) return null;
  if (token !== "USDC" && token !== "EURC") return null;
  if (!amount || !AMOUNT_RE.test(amount) || Number(amount) <= 0) return null;

  const req: PaymentRequest = { to: getAddress(to), token, amount };
  const n = sp.get('n');
  if (n) req.nonce = n.slice(0, 32);
  for (const k of MEMO_KEYS) {
    const v = sp.get(k);
    if (v) req[k] = v;
  }
  return req;
}
