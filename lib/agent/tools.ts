/**
 * Tool definitions and handlers for the Kred assistant.
 *
 * The governing rule: THE AGENT PROPOSES, THE USER DISPOSES. Nothing in this file
 * writes to the database, signs a transaction, or creates a shareable artifact. Tools
 * read the user's own income and hand back drafts; every state change still goes
 * through the existing UI where the user confirms it (tags via POST /api/tags,
 * payments via their wallet, disclosures via /share).
 *
 * That is not squeamishness. Kred's whole claim is that its figures are recomputed
 * from Arc rather than asserted by us. An agent that could quietly write tags or mint
 * disclosures would be a second, softer source of truth, which is exactly what the
 * product exists to avoid.
 *
 * SERVER ONLY.
 */
import type { Address } from "viem";
import { serverClient } from "@/lib/rpc";
import { fetchIncome, type Payment } from "@/lib/indexer";
import { formatAmount } from "@/lib/utils";
import { buildRequestPath } from "@/lib/request";
import { db } from "@/lib/db";
import type { ToolDef } from "@/lib/agent/client";

/** Wrap third-party text so the model can read it without obeying it. Angle brackets
 *  are stripped so a payer cannot forge a closing tag and escape the fence. */
export function fence(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/[<>]/g, "").slice(0, 200);
  return clean ? `<untrusted>${clean}</untrusted>` : null;
}

const AMOUNT_RE = /^\d+(\.\d+)?$/;
/** 0x + 64 hex. An address is 0x + 40, which is exactly the confusion this catches. */
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const DISCLOSURE_FIELDS = ["period", "count", "clients", "wallet"] as const;

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_income",
      description:
        "Read the connected wallet's incoming USDC/EURC payments on Arc, newest first, with any memo or tag attached. Call this before answering any question about amounts, clients, or dates.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "How many recent payments to read (1-50). Default 25.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_untagged_payments",
      description:
        "List payments that have no memo and no manual tag yet, along with what this wallet has previously called each payer. Use this before proposing tags, so suggestions reuse the user's own naming rather than inventing new names.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "How many untagged payments to return (1-30). Default 15.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_tags",
      description:
        "Surface tag suggestions to the user for confirmation. This does NOT save anything - the user reviews each suggestion and accepts or rejects it. Only propose a client name you have actual evidence for, such as the same payer address being labelled that way before. Say you are unsure rather than guessing a name.",
      parameters: {
        type: "object",
        properties: {
          proposals: {
            type: "array",
            description: "One entry per payment you are suggesting a tag for.",
            items: {
              type: "object",
              properties: {
                txHash: {
                  type: "string",
                  description:
                    "The payment's transaction hash: the 66-character txHash field (0x + 64 hex). NEVER the `from` field - that is the payer's address and is shorter. Copy it verbatim from get_untagged_payments.",
                },
                client: { type: "string", description: "Suggested client name." },
                project: { type: "string", description: "Suggested project." },
                category: { type: "string", description: "Suggested category." },
                reason: {
                  type: "string",
                  description:
                    "Short evidence for this suggestion, e.g. 'same payer was tagged Acme on 3 earlier payments'.",
                },
              },
              required: ["txHash", "reason"],
            },
          },
        },
        required: ["proposals"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_untag",
      description:
        "Surface a request to REMOVE manual tags, for the user to confirm. This does NOT delete anything - the user reviews each one and accepts or rejects it. Only manual tags can be removed. A memo written onchain by the payer is part of the transaction and cannot be edited or deleted by anyone, including the user; say so plainly rather than implying it was removed.",
      parameters: {
        type: "object",
        properties: {
          txHashes: {
            type: "array",
            description:
              "Transaction hashes whose manual tags should be removed. Use the 66-character txHash values from get_income, never the payer address.",
            items: { type: "string" },
          },
          reason: {
            type: "string",
            description: "Short note on why, shown to the user with the request.",
          },
        },
        required: ["txHashes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_payment_request",
      description:
        "Build a shareable payment-request link the user can send to a client. The memo fields travel with the payment onchain. This only builds the link - the user sends it, and the client pays it from their own wallet. Only amount and token are required: OMIT any optional field the user did not mention rather than asking them for it. They can edit the request afterwards.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "string",
            description: "Amount in human units, e.g. '1250.00'. Digits and at most one decimal point.",
          },
          token: { type: "string", enum: ["USDC", "EURC"] },
          client: { type: "string" },
          project: { type: "string" },
          invoice: { type: "string" },
          period: { type: "string", description: "YYYY-MM" },
          category: { type: "string" },
          note: { type: "string" },
        },
        required: ["amount", "token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prep_disclosure",
      description:
        "Work out what a verify link would reveal for a period, so the user can decide before creating one. Returns the payment count and per-token totals a verifier would recompute. This does NOT create the link - the user creates it on the Share page.",
      parameters: {
        type: "object",
        properties: {
          periodStart: { type: "string", description: "YYYY-MM" },
          periodEnd: { type: "string", description: "YYYY-MM" },
          fields: {
            type: "array",
            description:
              "Which optional fields to reveal: period, count, clients, wallet. Totals and backing transactions are always shown.",
            items: { type: "string", enum: ["period", "count", "clients", "wallet"] },
          },
        },
        required: ["periodStart", "periodEnd"],
      },
    },
  },
];

const ym = (ts: number) => new Date(ts).toISOString().slice(0, 7);
const ymd = (ts: number) => new Date(ts).toISOString().slice(0, 10);

function row(p: Payment) {
  return {
    date: ymd(p.timestamp),
    from: p.from,
    // Pre-formatted so the model never does decimal math on base units.
    amount: formatAmount(p.amount, p.tokenDecimals),
    token: p.tokenSymbol,
    txHash: p.txHash,
    client: fence(p.memo?.client),
    project: fence(p.memo?.project),
    invoice: fence(p.memo?.invoice),
    tagged: Boolean(p.memo),
  };
}

const NEVER_SUM =
  "Amounts are already formatted; repeat them verbatim. USDC and EURC are separate currencies and must never be added together.";

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}

async function getIncome(owner: Address, limit: number): Promise<string> {
  // Manual tags live in the DB, memos live on chain. Reading only the chain made the
  // agent blind to every tag the user had actually applied — it would report "no
  // tags" while the dashboard showed them.
  const [{ payments, truncated }, tags] = await Promise.all([
    fetchIncome(serverClient(), owner),
    db.tag.findMany({
      where: { address: owner.toLowerCase() },
      select: { txHash: true, client: true, project: true, category: true },
    }),
  ]);
  if (payments.length === 0) {
    return JSON.stringify({
      payments: [],
      note: "No incoming payments found for this wallet on Arc.",
    });
  }

  const tagByTx = new Map(tags.map((t) => [t.txHash.toLowerCase(), t]));

  return JSON.stringify({
    payments: payments.slice(0, clamp(limit, 1, 50, 25)).map((p) => {
      const tag = tagByTx.get(p.txHash.toLowerCase());
      return {
        ...row(p),
        // Which kind of label this is decides what can be done with it: a manual
        // tag is removable, an onchain memo is part of the transaction forever.
        manualTag: tag
          ? {
              client: fence(tag.client),
              project: fence(tag.project),
              category: fence(tag.category),
            }
          : null,
        labelSource: p.memo ? "onchain-memo" : tag ? "manual-tag" : "none",
      };
    }),
    totalPayments: payments.length,
    manualTagCount: tags.length,
    truncated,
    note: `${NEVER_SUM} labelSource says where a label came from: an onchain memo cannot be removed by anyone, a manual tag can.`,
  });
}

/** Untagged payments, plus the names this wallet has already used for each payer.
 *  The prior-names map is what keeps suggestions grounded: the model reuses the
 *  user's own vocabulary instead of inventing a plausible-sounding company. */
async function getUntagged(owner: Address, limit: number): Promise<string> {
  const [{ payments }, tags] = await Promise.all([
    fetchIncome(serverClient(), owner),
    db.tag.findMany({
      where: { address: owner.toLowerCase() },
      select: { txHash: true, client: true, project: true, category: true },
    }),
  ]);

  const tagByTx = new Map(tags.map((t) => [t.txHash.toLowerCase(), t]));
  const untagged = payments.filter(
    (p) => !p.memo && !tagByTx.get(p.txHash.toLowerCase())?.client,
  );

  // payer -> names previously used for them, from memos or manual tags
  const known = new Map<string, Set<string>>();
  for (const p of payments) {
    const name = p.memo?.client ?? tagByTx.get(p.txHash.toLowerCase())?.client;
    if (!name) continue;
    const payer = p.from.toLowerCase();
    let set = known.get(payer);
    if (!set) {
      set = new Set<string>();
      known.set(payer, set);
    }
    set.add(name);
  }

  return JSON.stringify({
    untagged: untagged.slice(0, clamp(limit, 1, 30, 15)).map((p) => ({
      ...row(p),
      previouslyCalled: [...(known.get(p.from.toLowerCase()) ?? [])].map((n) =>
        fence(n),
      ),
    })),
    untaggedCount: untagged.length,
    taggedCount: payments.length - untagged.length,
    note: "Only suggest a client name when previouslyCalled shows this payer was named before, or the user tells you the name. Otherwise say you do not know who the payer is and ask.",
  });
}

function draftRequest(owner: Address, args: Record<string, unknown>): string {
  const amount = String(args.amount ?? "").trim();
  if (!AMOUNT_RE.test(amount)) {
    return JSON.stringify({
      error: "Amount must be digits with at most one decimal point, e.g. 1250.00.",
    });
  }
  const token = args.token === "EURC" ? "EURC" : "USDC";
  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, 120) : undefined;
  };
  const period = str(args.period);
  if (period && !PERIOD_RE.test(period)) {
    return JSON.stringify({ error: "Period must be YYYY-MM." });
  }

  const path = buildRequestPath({
    to: owner,
    token,
    amount,
    client: str(args.client),
    project: str(args.project),
    invoice: str(args.invoice),
    period,
    category: str(args.category),
    note: str(args.note),
  });

  return JSON.stringify({
    path,
    note: "Give the user this link to send to their client. The memo fields travel onchain with the payment. You have not sent anything.",
  });
}

async function prepDisclosure(
  owner: Address,
  args: Record<string, unknown>,
): Promise<string> {
  const from = String(args.periodStart ?? "").trim();
  const to = String(args.periodEnd ?? "").trim();
  if (!PERIOD_RE.test(from) || !PERIOD_RE.test(to)) {
    return JSON.stringify({ error: "periodStart and periodEnd must be YYYY-MM." });
  }
  const [lo, hi] = from <= to ? [from, to] : [to, from];

  const { payments } = await fetchIncome(serverClient(), owner);
  const inRange = payments.filter((p) => {
    const m = ym(p.timestamp);
    return m >= lo && m <= hi;
  });

  if (inRange.length === 0) {
    return JSON.stringify({
      periodStart: lo,
      periodEnd: hi,
      paymentCount: 0,
      note: "No payments in that range, so a verify link would have nothing to show.",
    });
  }

  // Per token, never blended — there is no FX rate anywhere in this app.
  const totals = new Map<string, { amount: bigint; decimals: number }>();
  for (const p of inRange) {
    const t = totals.get(p.tokenSymbol) ?? { amount: 0n, decimals: p.tokenDecimals };
    t.amount += p.amount;
    totals.set(p.tokenSymbol, t);
  }

  const requested = Array.isArray(args.fields) ? (args.fields as unknown[]) : [];
  const fields = DISCLOSURE_FIELDS.filter((f) => requested.includes(f));
  const clients = new Set(inRange.map((p) => p.memo?.client).filter(Boolean)).size;

  return JSON.stringify({
    periodStart: lo,
    periodEnd: hi,
    paymentCount: inRange.length,
    totals: [...totals].map(([token, t]) => ({
      token,
      amount: formatAmount(t.amount, t.decimals),
    })),
    distinctClients: clients,
    willReveal: fields,
    alwaysShown: ["per-token totals", "backing transaction hashes"],
    createAt: "/share",
    note: `${NEVER_SUM} The user creates the link themselves on the Share page; you have not created one. A verifier recomputes these totals from Arc, so they never have to trust these numbers.`,
  });
}

export interface ToolOutcome {
  /** JSON string fed back to the model as the tool result. */
  result: string;
  /** Structured payload for the UI to render as something to act on, rather than
   *  prose for the model to narrate. */
  surface?: {
    kind: "proposals" | "request" | "disclosure" | "untag";
    data: unknown;
  };
}

/** Run one tool call. `owner` is null when no wallet is connected, in which case every
 *  data tool refuses rather than guessing. */
export async function runTool(
  name: string,
  rawArgs: string,
  owner: Address | null,
): Promise<ToolOutcome> {
  if (!owner) {
    return {
      result: JSON.stringify({
        error:
          "No wallet is connected, so there is no income to read. Ask the user to connect their wallet.",
      }),
    };
  }

  let args: Record<string, unknown> = {};
  try {
    args = (JSON.parse(rawArgs || "{}") as Record<string, unknown>) ?? {};
  } catch {
    /* a malformed argument blob just means defaults */
  }

  try {
    switch (name) {
      case "get_income":
        return { result: await getIncome(owner, Number(args.limit)) };

      case "get_untagged_payments":
        return { result: await getUntagged(owner, Number(args.limit)) };

      case "propose_tags": {
        const list = Array.isArray(args.proposals) ? args.proposals : [];

        // The model confuses `from` (a 40-hex address) with `txHash` (64-hex),
        // and a shortened address looks entirely plausible on a card. Validate
        // against this wallet's ACTUAL payments: anything that isn't a real tx
        // hash we indexed gets dropped here rather than becoming a button that
        // fails when pressed. Cross-checking against real payments also stops a
        // proposal targeting someone else's transaction.
        const { payments } = await fetchIncome(serverClient(), owner);
        const real = new Set(payments.map((p) => p.txHash.toLowerCase()));

        const good: unknown[] = [];
        const bad: string[] = [];
        for (const raw of list) {
          const p = (raw ?? {}) as { txHash?: unknown };
          const hash = typeof p.txHash === "string" ? p.txHash.trim() : "";
          if (TX_HASH_RE.test(hash) && real.has(hash.toLowerCase())) {
            good.push({ ...(raw as object), txHash: hash });
          } else {
            bad.push(hash || "(missing)");
          }
        }

        return {
          result: JSON.stringify({
            shown: good.length,
            rejected: bad.length,
            ...(bad.length
              ? {
                  problem:
                    "Rejected entries did not carry a real transaction hash for this wallet. txHash must be the 66-character value from get_untagged_payments (0x + 64 hex), NOT the payer address in the `from` field. Re-read the payments and propose again using the correct txHash.",
                  rejectedValues: bad.slice(0, 5),
                }
              : {}),
            note: "Anything shown is on screen for the user to accept or reject. Nothing has been saved. Do not claim you tagged anything.",
          }),
          surface: good.length
            ? { kind: "proposals", data: good }
            : undefined,
        };
      }

      case "propose_untag": {
        const raw = Array.isArray(args.txHashes) ? args.txHashes : [];
        // Same validation as propose_tags: only hashes belonging to THIS wallet's
        // real payments reach a button, so a confused model cannot offer to delete
        // something that isn't the user's.
        const { payments } = await fetchIncome(serverClient(), owner);
        const real = new Set(payments.map((p) => p.txHash.toLowerCase()));
        const onchain = new Set(
          payments.filter((p) => p.memo).map((p) => p.txHash.toLowerCase()),
        );
        // Only rows that actually carry a manual tag are removable.
        const tagged = new Set(
          (
            await db.tag.findMany({
              where: { address: owner.toLowerCase() },
              select: { txHash: true },
            })
          ).map((t) => t.txHash.toLowerCase()),
        );

        const good: string[] = [];
        const immutable: string[] = [];
        let rejected = 0;
        for (const h of raw) {
          const hash = typeof h === "string" ? h.trim() : "";
          if (!TX_HASH_RE.test(hash) || !real.has(hash.toLowerCase())) {
            rejected += 1;
          } else if (onchain.has(hash.toLowerCase()) && !tagged.has(hash.toLowerCase())) {
            immutable.push(hash); // memo is in the transaction; nobody can remove it
          } else {
            good.push(hash);
          }
        }

        return {
          result: JSON.stringify({
            shown: good.length,
            rejected,
            onchainMemos: immutable.length,
            note:
              (immutable.length
                ? `${immutable.length} of these carry a memo written onchain by the payer. That is part of the transaction and cannot be removed by anyone - explain this rather than implying it was deleted. `
                : "") +
              "Anything shown is on screen for the user to confirm. Nothing has been deleted. Do not claim you removed a tag.",
          }),
          surface: good.length
            ? {
                kind: "untag",
                data: {
                  txHashes: good,
                  reason: typeof args.reason === "string" ? args.reason : undefined,
                },
              }
            : undefined,
        };
      }

      case "draft_payment_request": {
        const result = draftRequest(owner, args);
        const parsed = JSON.parse(result) as { path?: string };
        return {
          result,
          surface: parsed.path
            ? { kind: "request", data: { path: parsed.path } }
            : undefined,
        };
      }

      case "prep_disclosure": {
        const result = await prepDisclosure(owner, args);
        const parsed = JSON.parse(result) as {
          paymentCount?: number;
          periodStart?: string;
          periodEnd?: string;
          totals?: { token: string; amount: string }[];
          willReveal?: string[];
        };
        // Only surface a card when there is actually something to disclose;
        // an empty range is a sentence, not a decision.
        return {
          result,
          surface: parsed.paymentCount
            ? { kind: "disclosure", data: parsed }
            : undefined,
        };
      }

      default:
        return { result: JSON.stringify({ error: `unknown tool: ${name}` }) };
    }
  } catch (err) {
    // Never let a failed read become a confident answer.
    return {
      result: JSON.stringify({
        error: `Tool ${name} failed: ${
          err instanceof Error ? err.message : "unknown error"
        }. Tell the user you could not read this rather than estimating.`,
      }),
    };
  }
}
