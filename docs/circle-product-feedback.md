# Circle Product Feedback

Submitted with **Kred** — verifiable proof-of-income for onchain freelancers.
Built on Arc testnet. Live at [kred.today](https://kred.today).

**Circle products used on Arc:** USDC, EURC, Arc Transaction Memos, the `CALL_FROM`
precompile, Multicall3.

Every observation below is first-hand, from building and shipping Kred against Arc
testnet between July 20 and August 5, 2026. Where something cost real debugging time,
we describe the symptom, because the symptom is the part that is hard to search for.

---

## Why we chose these products

**Transaction Memos are the reason this product exists.** Kred's premise is that a
freelancer's income record should be created *at settlement*, not reconstructed from a
spreadsheet afterwards. That requires the invoice context — client, project, invoice
number, period — to travel inside the payment itself. On most chains this means a side
database and a promise. Arc's Memo contract makes it a property of the transaction.

What made it usable rather than merely present was the `CALL_FROM` precompile. Because
the inner call executes with the original `msg.sender` preserved, a memo'd USDC transfer
still emits an ordinary ERC-20 `Transfer` with the *real payer* as `from`, alongside the
`Memo` event, in one transaction. Two consequences we did not have to design around:

- No `approve` step for a self-initiated transfer, so the payer signs exactly once.
- The read path and write path join cleanly on transaction hash, so a verifier can
  reconstruct the record from chain without trusting our index.

`memoData` being arbitrary `bytes` rather than a fixed 32-byte field mattered too. We
encode compact JSON (`{v, client, project, invoice, period, category, note}`) and use
`memoId = keccak256("<period>:<invoice>")`, so a verifier can group or filter memos
without decoding the full blob.

**USDC and EURC natively**, because proof-of-income has to be denominated in something a
bank recognises. Dollar-denominated gas also removed a class of UX problem: we never have
to explain a second token to a freelancer who just wants to get paid.

**Multicall3**, at the canonical CREATE2 address, already deployed on Arc. It is doing
more work than usual for us — see the rate-limit note below.

**What we did not use, stated plainly:** no Circle Wallets, Gateway, CCTP, Nanopayments,
USYC, or StableFX. Kred is a single-chain read-and-attest product today, so those would
have been integrations for their own sake rather than for the user. The architecture
diagram marks where Wallets and Gateway would slot into a production version.

---

## What worked well

**Standard tooling worked unmodified.** viem, wagmi, RainbowKit and `solc` needed no
Arc-specific patches. Deploying our `KredRegistry` contract was `solc` plus
`viem.deployContract` against the public RPC, and it verified on Arcscan without special
handling. For a chain this young, "your existing stack just works" is worth saying out loud.

**Sub-second deterministic finality changes the UX, not just the benchmark.** The payer
clicks pay and the receipt is *there*. We never built a pending state with a spinner and a
hopeful message, because we never needed one. For a payments product aimed at non-crypto
users, that removes an entire category of explanation.

**The Memo contract's ABI was readable straight off Arcscan** and matched the deployed
bytecode, so we could work from the authoritative source rather than documentation that
might have drifted.

**Receipt-based verification is exact and needs no scan.** Our public verify page
recomputes every figure from the specific disclosed transaction hashes via
`getTransactionReceipt`. That is trustless, cheap, and sidesteps log-range limits
entirely. It is the single design decision that lets us claim "the database never holds
an amount" and mean it literally.

---

## What could be improved

### 1. USDC has two interfaces, and the difference is silent

This cost us more time than anything else on this list.

USDC is Arc's native gas coin at **18 decimals**, and simultaneously an ERC-20 at
`0x3600…0000` at **6 decimals**. Critically, a USDC transfer emits its `Transfer` event
from the system address `0xffff…fffe` **in 18 decimals** — not from the `0x3600…`
contract, and not in 6.

The failure mode is quiet. Code that reasonably assumes "the ERC-20 at `0x3600…` emits
the Transfer" finds nothing and reports zero income, which reads as *"this wallet has no
payments"* rather than *"you are watching the wrong emitter."* Nothing reverts. Nothing warns.

We now prefer the native (`0xffff…fffe`) event, divide by `1e12` to reach ERC-20 units,
and fall back to a `0x3600…` event — never counting both. EURC, being an ordinary ERC-20,
behaves exactly as expected, which makes the asymmetry easier to trip over.

### 2. The public RPC rate-limits rapid sequential `eth_call`s, and fails soft

Reading two token balances back-to-back, the **second call silently returned `-32011`**.
Not an exception we caught — a result our code rendered as a balance of **0**. A user
holding EURC saw zero EURC, with no error anywhere in the UI.

This is the more dangerous shape of a rate limit: it looks like data. We fixed it by
routing every multi-read through Multicall3, which is the right answer, but we only found
it because a wallet we *knew* held funds displayed zero.

### 3. `eth_getLogs` is capped at 10,000 blocks on a ~52,000,000-block chain

`-32614` on anything wider. A from-genesis `Transfer` scan is not merely slow, it is
infeasible — roughly 5,200 sequential requests against a rate-limited endpoint.

The practical consequence is that **any app needing a wallet's payment history has no
first-party path to it**, and must depend on the block explorer's `tokentx` API. Which
leads directly to the next point.

### 4. The explorer API is a hard dependency, and it goes down

`testnet.arcscan.app` returned `503 Service Temporarily Unavailable` for an extended
period on August 5. Because history is only reachable through it, Kred could not read
income at all during the outage.

Worse, our own first implementation swallowed the failure and rendered an empty list, so
the app told users *"no incoming payments yet"* — a confident, false statement about
someone's income, produced by a request that never succeeded. We have since made a failed
read fail loudly. But the underlying point stands: an indexed-history dependency with no
fallback and no status page is a single point of failure for every consumer app on Arc.

### 5. Mainnet has a date but no numbers

Public mainnet is announced for September 16, 2026. As of today the docs still state that
mainnet contract addresses are not yet available, and there is no published chain ID, RPC
URL, explorer URL, migration guide, or production-readiness checklist.

We want to deploy on day one. Right now we cannot even pre-write the config, and we are
left inferring whether the `0x3600…` USDC predeploy carries over — an inference we have
deliberately refused to hardcode.

### 6. Documentation hostname migration

`docs.arc.network` and `rpc.testnet.arc.network` now 301 to `arc.io`, but both hostnames
still appear across docs, sample apps and community posts. Minor, but it makes it
genuinely unclear which is canonical when you are new.

---

## Recommendations

1. **Put the USDC dual-interface behaviour on the "Connect to Arc" page, not deep in a
   reference.** One paragraph — native is 18dp and emits from `0xffff…fffe`, ERC-20 is 6dp
   at `0x3600…`, divide by `1e12`, never count both — would have saved us hours and will
   save every indexer author the same hours. This is the highest-value documentation change
   available.

2. **Make rate limiting fail loudly.** `-32011` returned as a *result* that decodes to a
   zero balance is the worst possible shape for a failure. An explicit error, a
   `Retry-After`, or documented per-second limits would turn a silent wrong number into a
   handled exception. Silent wrong numbers are especially costly in financial apps, where
   nobody double-checks a plausible figure.

3. **Ship a first-party indexed-history endpoint**, or document the explorer's `tokentx`
   API as a supported interface with a status page and published rate limits. Today every
   consumer app on Arc depends on an endpoint that is not presented as an API contract.
   Given the 10k-block cap, this is not optional infrastructure — it is the only path to a
   wallet's history.

4. **Publish mainnet network values and a testnet-to-mainnet migration checklist before
   September 16**, ideally two weeks ahead. Even a "these addresses are final" post lets
   teams pre-write config and deploy on launch day instead of scrambling. Explicitly
   confirming whether predeploy addresses carry over would remove the guesswork entirely.

5. **Add a canonical worked example for Transaction Memos.** The primitive is genuinely
   differentiating, and we found no end-to-end sample showing the write
   (`Memo.memo(token, encodeFunctionData(transfer), memoId, memoData)`) joined to the read
   (decode the `Memo` event, match the `Transfer` on `txHash`). We reconstructed it from
   the ABI. A 40-line sample would move this from "advanced primitive you discover" to "the
   obvious way to attach context to a payment on Arc," which is what it deserves to be.

6. **Consider a memo-aware explorer view.** Arcscan shows the `Memo` event as raw bytes.
   Decoding known memo formats, or simply rendering the UTF-8 payload, would make memo'd
   payments legible to anyone auditing a transaction — including the banks and landlords
   who are the eventual audience for a product like ours.

---

## What we would build next with Circle tooling

- **Circle Wallets**, for freelancers who are not crypto-native. Today Kred requires a
  self-custody wallet, which excludes exactly the users who most need portable proof of
  income.
- **Gateway** on the payer side, so a business paying dozens of contractors can route from
  one treasury balance rather than pre-funding a wallet per corridor.
- **CCTP**, so a freelancer paid on another chain can fold that income into the same proof,
  with the bridge transfer itself forming part of the verifiable trail.
