/**
 * KredEscrow — milestone-released stablecoin escrow for invoices on Arc.
 *
 * The invoice id is DERIVED, never stored: a keccak256 of the request's canonical
 * content, so payer and payee compute the same id from the same /pay link with no
 * database, no account and no coordination step. That keeps escrow consistent with
 * how payment requests already work here — the link carries everything and the chain
 * holds the state.
 *
 * Consequence worth knowing: two identical invoices (same payee, token, amount,
 * invoice number and period) collide on one id. That is why the invoice number is
 * part of the hash, and why the UI should push people to set one.
 */
import {
  keccak256,
  toHex,
  isAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { PaymentRequest } from "@/lib/request";

export const KRED_ESCROW_ABI = [
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "payee", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "payee", type: "address" },
      { name: "token", type: "address" },
      { name: "total", type: "uint256" },
      { name: "released", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "closed", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "Opened",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "totalReleased", type: "uint256", indexed: false },
      { name: "total", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Deployed address, or null while the feature is dormant. Same pattern as the
 *  registry: no address, no escrow UI anywhere. */
export function escrowAddress(): Address | null {
  const a = process.env.NEXT_PUBLIC_KRED_ESCROW_ADDRESS;
  return a && isAddress(a) ? (a as Address) : null;
}

export function isEscrowEnabled(): boolean {
  return escrowAddress() !== null;
}

/** Canonical invoice id for a payment request. Both sides of the link derive this
 *  independently, so it must stay pure and must never include anything the two
 *  parties could observe differently (no timestamps, no locale formatting). */
export function invoiceIdFor(r: PaymentRequest): Hex {
  const canonical = JSON.stringify({
    v: 2,
    to: r.to.toLowerCase(),
    token: r.token,
    amount: r.amount,
    invoice: r.invoice?.trim() ?? "",
    period: r.period?.trim() ?? "",
    // The salt is what makes each issued request its own escrow. Without it,
    // re-issuing the same invoice number and amount derives the same id, and the
    // payer's page reports the PREVIOUS escrow as settled for an invoice they have
    // not paid. Links minted before this existed have no nonce and keep their old
    // v1 id shape only in the sense that they collide with each other, which is the
    // behaviour they already had.
    nonce: r.nonce?.trim() ?? "",
  });
  return keccak256(toHex(canonical));
}

/** Block KredEscrow was deployed. Scanning from genesis is impossible on Arc (see
 *  below), and everything before this block is by definition not ours. */
export const ESCROW_DEPLOY_BLOCK = 55_465_971n;

/** Arc rejects an eth_getLogs range wider than 10,000 blocks with -32614. */
const LOG_RANGE = 9_000n;

export interface EscrowState {
  payer: Address;
  payee: Address;
  token: Address;
  total: bigint;
  released: bigint;
  remaining: bigint;
  deadline: number; // unix seconds
  closed: boolean;
  /** deadline passed and something is still held */
  refundable: boolean;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export interface EscrowEntry extends EscrowState {
  invoiceId: Hex;
}

/**
 * Every escrow committed TO `payee`, newest first.
 *
 * There is no per-payee index on-chain — escrows are keyed by invoice id — so this
 * finds them through the `Opened` event, whose payee is indexed. The event only tells
 * us an escrow was opened, never its current state, so each hit is then re-read with
 * statusOf: released amounts and closure come from the contract, not from replaying
 * logs. That matters because Arc caps eth_getLogs at 10,000 blocks (-32614), so a
 * log-only reconstruction would silently lose history the moment the chain outgrows
 * one query.
 *
 * The scan is chunked from the deploy block for the same reason, and gives up rather
 * than returning a partial list — a freelancer being shown 3 of their 5 committed
 * escrows is worse than being told the read failed.
 */
export async function listEscrowsFor(
  client: PublicClient,
  payee: Address,
): Promise<EscrowEntry[] | null> {
  const address = escrowAddress();
  if (!address) return null;

  try {
    const head = await client.getBlockNumber();
    const opened = KRED_ESCROW_ABI.find(
      (x) => x.type === "event" && x.name === "Opened",
    );
    if (!opened) return null;

    const ids = new Set<Hex>();
    for (let from = ESCROW_DEPLOY_BLOCK; from <= head; from += LOG_RANGE + 1n) {
      const to = from + LOG_RANGE > head ? head : from + LOG_RANGE;
      const logs = await client.getLogs({
        address,
        event: opened as never,
        args: { payee } as never,
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        const id = (l as { args?: { invoiceId?: Hex } }).args?.invoiceId;
        if (id) ids.add(id);
      }
    }

    // Current state per escrow, straight from the contract.
    const out: EscrowEntry[] = [];
    for (const id of ids) {
      const s = await readEscrow(client, id);
      if (s) out.push({ ...s, invoiceId: id });
    }
    // Soonest deadline first: what needs attention, not what happened first.
    return out.sort((a, b) => a.deadline - b.deadline);
  } catch {
    return null;
  }
}

/** Read one escrow. Returns null when the feature is off, the read fails, or no
 *  escrow exists at that id.
 *
 *  A nonexistent escrow decodes as all zeros, which would otherwise read as a
 *  perfectly valid closed escrow of zero value — so an empty payer is treated as
 *  "no escrow" rather than passed upward as state. */
export async function readEscrow(
  client: PublicClient,
  invoiceId: Hex,
): Promise<EscrowState | null> {
  const address = escrowAddress();
  if (!address) return null;
  try {
    const r = (await client.readContract({
      address,
      abi: KRED_ESCROW_ABI,
      functionName: "statusOf",
      args: [invoiceId],
    })) as readonly [Address, Address, Address, bigint, bigint, bigint, boolean];

    const [payer, payee, token, total, released, deadline, closed] = r;
    if (payer.toLowerCase() === ZERO) return null;

    const remaining = total - released;
    const secs = Number(deadline);
    return {
      payer,
      payee,
      token,
      total,
      released,
      remaining,
      deadline: secs,
      closed,
      refundable: !closed && remaining > 0n && Date.now() / 1000 >= secs,
    };
  } catch {
    return null;
  }
}
