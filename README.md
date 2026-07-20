# Kred

**Verifiable proof-of-income for onchain freelancers — built on [Arc](https://www.arc.io/), Circle's stablecoin-native L1, powered by Arc Transaction Memos.**

Freelancers paid in USDC/EURC have no payslip — nothing a bank, landlord, or visa
officer will accept. Kred turns your Arc payment history into a **verifiable,
selectively-shareable proof of income**: a statement where every line is backed by an
on-chain tx hash, and a public verify link a third party can confirm against Arc
**without trusting your word**.

> The chain is always the source of truth for amounts. Our database stores only tags
> and disclosure preferences — never the numbers.

## Why Arc Transaction Memos

An Arc payment settles instantly but arrives as a bare transfer. Arc's **Memo contract**
lets a payer attach structured context (invoice, project, period) to a payment — and,
because it routes through the `CALL_FROM` precompile, the payment still emits a normal
ERC-20 `Transfer` from the **real payer** plus a `Memo` event in the **same transaction**.
Kred reads both (F1) and writes them (F3). See [`docs/arc-notes.md`](docs/arc-notes.md).

## Features

| | Feature | Status |
|---|---|---|
| F1 | Connect + index incoming USDC/EURC on Arc | ✅ |
| F2 | Decode memos + manual tagging | ✅ |
| F3 | **Pay-with-memo** request/payer flow (the showcase) | ✅ |
| F4 | Income statement + charts + branded PDF | ✅ |
| F5 | Public verify page + selective disclosure (trustless recompute) | ✅ |
| F6 | On-chain statement anchor | ◻ stretch |
| F7 | Polished, responsive, dark/light UI (WebGL fluid hero) | ✅ · ongoing polish |

All correctness-critical paths went through an adversarial multi-agent review pass
before this status was claimed — see `PROGRESS.md`.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · wagmi + viem · RainbowKit ·
Recharts · @react-pdf/renderer · Prisma (SQLite local / Postgres deployed).

## Live

**https://kred.today** — deployed on Railway (Next.js
server + managed Postgres; the metadata DB stores only tags & disclosure prefs).

## Getting started

```bash
npm install
cp .env.example .env.local     # placeholders work out of the box
npm run dev                    # http://localhost:3000
```

Connect a wallet, switch to **Arc Testnet** when prompted, and fund it from the
[Circle faucet](https://faucet.circle.com).

### Arc testnet at a glance

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC (ERC-20) | `0x3600…0000` (6 dp) |
| EURC | `0x89B5…D72a` (6 dp) |
| Memo contract | `0x5294…E505` |

Full, verified reference: [`docs/arc-notes.md`](docs/arc-notes.md). Progress log:
[`PROGRESS.md`](PROGRESS.md).

## Known limitations (MVP)

Surfaced by an adversarial multi-agent review pass; the correctness bugs are fixed, these
are the deliberate scope calls:

- **No wallet authentication yet.** The tags API (private categorization metadata) trusts
  the `address` param, so tags are readable/writable per address without a signature
  (IDOR). Proper fix is Sign-In-with-Ethereum; deferred as it's a full auth layer, and
  this is a testnet MVP. The **chain-derived data (income, verify) needs no auth** — it's
  public + recomputed.
- **Verify links are unauthenticated + not globally rate-limited.** Amplification is
  bounded per link (≤500 disclosed txs + short ISR caching on `/verify`); global
  rate-limiting belongs at the deploy edge and is deferred.
- **History indexes the most recent ~6,000 transfers** (memo enrichment: most recent
  ~250). Truncation is surfaced in the UI rather than silently dropped.

## License

MIT.
