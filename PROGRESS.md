# Progress

Running log of milestones. Chain is the source of truth; DB is metadata only.

## Status

- [x] **M0 — Ground truth + scaffold** ✅
  - [x] Verified Arc facts → [`docs/arc-notes.md`](docs/arc-notes.md)
  - [x] Next.js 14 + TS + Tailwind + wagmi/viem/RainbowKit scaffold
  - [x] Arc testnet chain configured in [`config/arc.ts`](config/arc.ts)
  - [x] Memo adapter interface + verified ABI in [`lib/memo/`](lib/memo)
  - [x] `npm run build` green; dev server renders landing + connect, console clean
- [ ] **M1 — Connect + index incoming USDC/EURC (F1)**
- [ ] **M2 — Memo adapter decode + tagging (F2)**
- [ ] **M3 — Pay-with-memo request/payer flow (F3)** ← Memo showcase
- [ ] **M4 — Income Statement + charts + PDF (F4)**
- [ ] **M5 — Public verify + selective disclosure (F5)**
- [ ] **M6 (stretch) — PayslipRegistry anchor (F6)**
- [ ] **M7 — UI polish + README + deploy + demo (F7)**

## Key decisions

- **Memo mechanism:** memo'd payments route through Arc's Memo contract
  (`0x5294..E505`) → inner `transfer` via `CALL_FROM` precompile preserves the payer as
  `msg.sender`. So `Transfer` + `Memo` events land in the **same tx**; we join on tx hash.
- **No approve needed** for pay-with-memo (CALL_FROM makes the payer the direct sender).
- **Selective disclosure** discloses backing tx hashes for the verified view (trustless
  recompute), rather than Arc's not-yet-live confidential-tx feature.
