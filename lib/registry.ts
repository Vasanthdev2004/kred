/**
 * KredRegistry (F6) — the on-chain anchor for income disclosures.
 *
 * A disclosure's "digest" is a keccak256 of its CANONICAL, order-independent content
 * (record id + owner + period + the set of tx hashes). It is computed server-side only
 * — returned once when the disclosure is created (so the client anchors that exact
 * value) and recomputed at /verify — so the anchored digest and the verify check can
 * never drift.
 * The chain, not the DB, is the source of truth for whether/when something was anchored.
 */
import {
  keccak256,
  toHex,
  isAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

export const KRED_REGISTRY_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [{ name: "digest", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "digest", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "anchoredAt",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "digest", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "revokedAt",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "digest", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "digest", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Revoked",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "digest", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Deployed KredRegistry address, or null when the feature isn't deployed yet.
 *  Env-driven so the anchor UI + verify read stay dormant until a real deployment. */
export function registryAddress(): Address | null {
  const a = process.env.NEXT_PUBLIC_KRED_REGISTRY_ADDRESS;
  return a && isAddress(a) ? (a as Address) : null;
}

export function isRegistryEnabled(): boolean {
  return registryAddress() !== null;
}

/** Canonical, order-independent digest of a disclosure's attested content.
 *  MUST be computed the same way at create-time and verify-time — so keep it pure
 *  and always route disclosure content through it (never hand-roll the JSON).
 *
 *  `id` is part of the canonical input and is NOT optional: without it two different
 *  disclosure records over the same wallet/period/tx-set (say, a second one revealing
 *  fewer fields) collapse to the same digest. Since revocation is one-way and keyed by
 *  digest alone, that would mean revoking one proof silently withdraws every sibling —
 *  and the "create a new proof to share again" advice would mint an already-revoked
 *  link. Requiring the id in the signature makes a call site that forgets it fail to
 *  compile rather than quietly mint a colliding digest.
 *
 *  CHANGING THIS FORMULA (including `v`) ORPHANS EVERY EXISTING ANCHOR: already-anchored
 *  disclosures would recompute to a digest that has nothing on-chain, so they'd read as
 *  never anchored and their revocations would stop being found. Free to change only
 *  while nothing has been anchored. */
export function disclosureDigest(input: {
  /** the disclosure record's own id — what makes the digest per-disclosure */
  id: string;
  address: string;
  periodStart: string;
  periodEnd: string;
  txHashes: string[];
}): Hex {
  const canonical = JSON.stringify({
    v: 2,
    id: input.id,
    address: input.address.toLowerCase(),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    txHashes: [...new Set(input.txHashes.map((h) => h.toLowerCase()))].sort(),
  });
  return keccak256(toHex(canonical));
}

/** Commitment to a disclosure's owner, so a PUBLIC page can gate an owner-only control
 *  without publishing the wallet.
 *
 *  /verify renders server-side, so props handed to a client component are serialized into
 *  the page payload every visitor receives. Shipping the raw address there would reveal it
 *  even when the owner left "Wallet address" unticked, which is exactly what that toggle
 *  promises not to do. The connected wallet hashes itself the same way and compares. */
export function ownerCommitment(address: string): Hex {
  return keccak256(toHex(address.toLowerCase()));
}

/**
 * What the chain says about a disclosure.
 *
 * `unknown` exists so a failed read can never be mistaken for "not revoked":
 * collapsing both into null would mean one Arc rate-limit is enough to render a
 * withdrawn proof's figures, which is the one promise revocation makes. Callers
 * must treat `unknown` as "withhold", not as "fine".
 */
export type AnchorState =
  | { status: "none" }
  | { status: "anchored"; anchoredAt: number; txHash: string | null }
  | { status: "revoked"; anchoredAt: number; revokedAt: number }
  | { status: "unknown" };

/** Read the on-chain state for (owner, digest). Timestamps come from the contract —
 *  the DB is never trusted for them.
 *
 *  Both slots are read in one multicall, since Arc rate-limits rapid separate
 *  eth_calls and reading them apart could observe an anchor without its revocation.
 *  A failed read is reported as `unknown`, never as `none`. */
export async function readAnchor(
  client: PublicClient,
  owner: Address,
  digest: Hex,
  txHash: string | null,
): Promise<AnchorState> {
  const registry = registryAddress();
  if (!registry) return { status: "none" }; // dormant: nothing was ever anchored
  try {
    const base = {
      address: registry,
      abi: KRED_REGISTRY_ABI,
      args: [owner, digest],
    } as const;
    const [anchored, revoked] = (await client.multicall({
      contracts: [
        { ...base, functionName: "anchoredAt" },
        { ...base, functionName: "revokedAt" },
      ],
      allowFailure: false,
    })) as [bigint, bigint];
    // Revocation is reported even if this digest was never anchored, so a stray
    // revoke can't be stepped around by simply not anchoring first.
    if (revoked !== 0n) {
      return {
        status: "revoked",
        anchoredAt: Number(anchored),
        revokedAt: Number(revoked),
      };
    }
    if (anchored === 0n) return { status: "none" };
    return { status: "anchored", anchoredAt: Number(anchored), txHash };
  } catch {
    return { status: "unknown" };
  }
}
