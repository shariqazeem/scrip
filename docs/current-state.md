# Scrip — what exists, and what it does when you run it

> Observed on 2026-09-15, the day Webgold became Scrip, and again on 2026-09-16, the day
> the company plan (`docs/SCRIP-COMPANY-PLAN.md`) was built, by running the code and
> reading the result. No plan and no recommendations. Observations are stated as
> observations, with the measurement that produced them. Part 5 is the 2026-09-16 state.

---

# Part 1 — What it is

**Scrip is a rule on your wallet: a slice of every dollar that lands becomes stock, in the
same wallet, with a receipt.** The complete definition is `docs/scrip.md`; the short spec,
the architecture and the drift log are `CLAUDE.md`.

Four objects: a rule on the owner's own USDC account, enforced by the program and driven by
permissionless keepers; a receipt, a permanent on-chain account measured at 7 and 30 days; a
pay link, the intake for attributed payments; a public ledger with keep-rate.

# Part 2 — What has been built

## Repository

| | |
| --- | --- |
| Program | `anchor/programs/scrip/`, 2,385 lines of Rust across seven modules, 15 instructions, 4 account types, 40 unit tests |
| Library | `src/lib/`, 7,900 lines including the committed IDL types |
| Surfaces | 16 pages, 2,030 lines; 2,135 lines of components; 2,491 lines of CSS |
| Keeper | `src/keeper/index.ts`, 395 lines |
| Offline tests | **183 passed, 13 skipped** across 21 files (2 live batteries skipped by flag) |
| On-chain tests | **11 passed** against the deployed devnet program (`npm run test:devnet`) |
| `lint` / `typecheck` / `build` | clean as of 2026-09-15 |

## The program

Deployed to **devnet** at `Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj`, slot 498,678,765,
640,000 bytes reserved, upgradeable by `FKfq2A…` (the deployer, `anchor/.keys/deployer.json`,
holding 0.39 devnet SOL and 0 mainnet SOL after the deploys and the batteries). The deployed
binary is the `devnet` feature build; the mainnet build (`anchor/target/deploy/scrip-mainnet.so`,
611,472 bytes) is built and untested on chain.

| Instruction | What it does |
| --- | --- |
| `open_book(slug, terms_version)` | creates the Book and the Handle; the asset must be on the registry; xStocks need `terms_version >= 1`; the rent may be paid by a relayer |
| `set_asset(terms_version)` | changes the asset; resets the watermark |
| `close_book` | returns rent and float; requires the rule off |
| `enable_rule(rate, escalate, floor, cap, tolerance)` | requires the delegate already approved; watermark = current balance |
| `set_rule(…)` | same ranges; watermark reset; escalation clock restarts only if rate or escalation changed. Doubles as resume |
| `disable_rule` | requires the delegate already revoked |
| `sync_watermark` | anyone; lowers the watermark to the balance after a spend |
| `withdraw_float(lamports)` | keeps the Book above rent |
| `begin_sweep(release_id)` | top-level only; exactly one per transaction; a `finish_sweep` for the same book and release must follow; computes the slice; delegate-transfers it to the keeper; creates the owner's asset account if missing |
| `finish_sweep(release_id)` | owner's cash unchanged; Pyth account fully verified, one of the book's two feeds, under 600 s, confidence under 1%; min-out through the live multiplier for the share feed; receipt; keeper repaid from float |
| `fund_payout(…)` | creates the Payout and its escrow token account |
| `release_payout` | escrow ≥ the payer's minimum → recipient's own account; receipt; escrow and Payout closed |
| `claim_payout` | the named recipient, or the claim key's holder; a relayer may pay; receipt |
| `cancel_payout` | the sponsor, after thirty days |
| `measure_receipt(7 \| 30)` | anyone; writes the recipient's raw balance of the asset |
| `open_grant(grant_id, recipient, reason_hash, declared_usdc, start, cliff_secs, duration_secs)` | (2026-09-16 build) creates the Grant and its escrow; the schedule is validated (cliff ≤ duration ≤ ten years) |
| `seal_grant(float_lamports)` | after the route filled the escrow: records `total_raw`, funds the float, state Active; a Grant receipt to the recipient |
| `vest(release_id)` | anyone; releases `releasable_raw(now)` to the recipient's own account; a Vest receipt with the grant's reason; the caller repaid tip + receipt rent from the float |
| `revoke_grant` | the payer; caps releases at what has vested; the unvested part returns to the payer |
| `close_grant` | the payer, once nothing is owed; rent and float return |

The 2026-09-16 build also gives `open_book` a `kind` (Person or Org), `fund_payout` a
`run_id`, and the Receipt `run_id` and the kinds Sweep, Pay, Gift, Grant, Vest. It is
`anchor/target/deploy/scrip-devnet.so`, 581,024 bytes, 43 Rust tests, **not yet on devnet**
(about 4.5 devnet SOL of buffer rent; the 640,000-byte allocation fits it). It is proven on
a local validator: `npm run test:localnet`, 19 tests, 2026-09-16.

## What has been exercised on chain (devnet, 2026-09-15)

Eleven tests through the deployed program, with a classic six-decimal mint standing in for
USDC, a Token-2022 mint carrying the SPYx multiplier (1.005714560286254) standing in for
SPYx, a plain transfer from the keeper's stash standing in for the route, and Pyth's real
SOL/USD and USDC/USD accounts on devnet as the price:

- open a book; turn the rule on in one transaction (approve, float, enable); the watermark
  is the $1,000 already there; the delegate and allowance read back
- `enable_rule` without the approve refused (`DelegateNotSet`)
- a $200 arrival swept at 10% against SOL/USD: $20 left the owner, $20 reached the keeper,
  the minimum plus one unit arrived, watermark $1,180, `sweeps = 1`, the receipt's basis,
  rate, slice, units and feed id read back, the float fell by exactly tip + receipt rent +
  the created token account's rent
- `begin_sweep` alone refused (`NoFinishSweep`); a fill below the Pyth minimum reverted the
  whole transaction including the delegate transfer (`ReceivedBelowMinimum`)
- a sweep priced by USDC/USD (a UI-unit feed) with exactly the multiplier-adjusted minimum,
  which is below the naive minimum: accepted, receipt's feed id = USDC/USD
- the owner sent $500 away; `sync_watermark` lowered the watermark to the balance; a second
  call refused (`WatermarkNotAbove`)
- an intake: memo, `fund_payout`, the route into the escrow, `release_payout` in one
  versioned transaction; the recipient's balance rose by the escrow; escrow and Payout gone;
  the receipt's reason hash equals sha256 of the memo
- a release below the payer's minimum refused (`EscrowBelowMinimum`)
- a sponsored position for an address with no book, then claimed by that address from a
  wallet holding 0 SOL, with the deployer paying as relayer and `open_book` in the same
  transaction; `cancel_payout` refused before thirty days
- `measure_receipt(7)` refused before the window (`TooEarlyToMeasure`)
- `revoke` by the owner, then a sweep attempt refused (`DelegateNotSet`); the rule still
  reads `enabled` on chain, because pausing is the delegate's absence, not a flag

The first devnet deploy failed every one of these with garbage pointers; the cause was the
4 KiB stack frame and the fix was boxing every deserialized account
(`docs/decisions.md`, 2026-09-15).

## The libraries

| Module | Job |
| --- | --- |
| `lib/assets/registry.ts` | 15 assets read off mainnet: USDC, SPYx, QQQx, GOLD, eleven single names; issuer, wrapper, powers, two feed ids each, Jupiter depth on the read date. `spec-agreement.test.ts` reads `registry.rs` |
| `lib/rule/slice.ts`, `min-out.ts` | the program's arithmetic, mirrored; tests read `rule.rs` |
| `lib/rule/instructions.ts`, `lib/intake/instructions.ts`, `lib/sweep/instructions.ts` | instruction builders from the IDL's own account lists, with round-trip tests |
| `lib/book/decode.ts` | Book, Handle, Payout, Receipt through `BorshAccountsCoder` |
| `lib/book/read-book.ts` | the rule's state from chain facts: on, paused, delegate replaced, allowance exhausted, float empty, no USDC account, off |
| `lib/book/read-receipt.ts` | a receipt from one signature, with the memo verified against the hash |
| `lib/intake/build.ts` | the intake transaction: memo, fund, Jupiter into the escrow, release; sponsor mode |
| `lib/sweep/build.ts` | the sweep transaction; refuses above 1,232 bytes |
| `lib/jupiter/client.ts` | quote, swap instructions, lookup tables, display prices |
| `lib/pyth/*` | PriceUpdateV2 parsing (same offsets as the program), Hermes with the API key |
| `lib/ledger/indexer.ts` | incremental with a cursor, pages with `before`, oldest first; attribution; measurement refresh; book mirror |
| `lib/ledger/crank.ts` | `measure_receipt` with `SCRIP_CRANK_KEYPAIR` |
| `lib/keep-rate.ts` | 7 and 30 days, per recipient and asset, weighted by dollars, capped by the balance across all of a person's receipts |
| `lib/corporate-actions/*` | the live multiplier (the timestamp on the mint decides), the watcher recording every rebase |
| `lib/wallet/client.ts` | Wallet Standard connect, sign-and-send, sign-only |

## The surfaces

| Route | What is on it |
| --- | --- |
| `/` | A film, all of it real. **Dark opening:** the headline; right of it, the front book (`NEXT_PUBLIC_FRONT_BOOK`, a published handle) prints its last two receipts live under a dark printer bar, with the ghost stub while money waits; on mainnet a Solana Pay QR "send this wallet $N and watch" (N derived from the rate and the minimum slice). Then **the tape**: one moving line of SPYx, QQQx and GOLD prices, day change, the underlying's price, holders, the NYSE session and the UTC clock, from Jupiter and the clock. Then **the mechanism**: the last sweep replayed from its receipt as a scene (payer, the coin on the wire, the address with its rule, the atomic transaction lighting up begin_sweep, the route, finish_sweep with the Pyth check, then the split: became N units / stayed USDC), with the six steps beneath, Replay, and Open the receipt; where no sweep exists, the front book's rate on $100, labelled arithmetic. Then **the market band** on dark: "The S&P 500 is open/closed. Solana is open.", the clock, the session line, and for SPYx, QQQx and GOLD the Jupiter price rolling to its value, 24h change, the underlying's price and the tracker's drift, 24h volume, liquidity, holders, the live dividend multiplier from the mint on mainnet — read live, cached 30 s. **The paper tears off** (the stub's perforation as the seam): the line; the three firsts, each a scene whose object enters when reached — a real stub prints (01), the rule plate fills to the front book's rate on its real address (02), the latest receipt draws itself row by row with its still-held rows (03); the evidence as two bars filling to the studies' figures; the honesty rows entering one by one; the record with counters rolling to the real totals and the three latest stubs printing in sequence. **Dark close:** "Set a rate once. Then get paid." No front book configured: the latest real stub under the printer, else the labelled worked example |
| `/pay/[handle]` | two tabs. In stock: the form, presets, a debounced Jupiter quote, wallet buttons, a Solana Pay transaction-request QR the page polls. In USDC: amount, the recipient's normal address with copy, "what happens" ($X becomes stock under their rule, $Y stays USDC), and a Solana Pay transfer-request QR — no Scrip transaction. `?in=usdc` opens the second. Sponsor mode for an address with no book |
| `/receipt/[sig]` | the stub from the chain; what arrived with issuer chips; where it is anchored; the copy button is the only client JavaScript; `opengraph-image` |
| `/claim/[payer]/[rid]` | "N units are waiting for you, from @x"; handle input if no book; attestation for xStocks; claim with a relayer paying |
| `/ledger` | the aggregates as a ruled strip (receipts, value converted, units delivered, wallets with the rule on, keep-rate at 7 and 30 days or the date the first receipt matures), then a wall of compact stubs, newest first, each with its still-held rows; a handle is named only where its owner published the book |
| `/assets` | 15 rows with issuer, wrapper, depth, powers as chips, per-row disclosure |
| `/docs` + five pages | what Scrip does; how the rule sees money; keepers; receipts; keep-rate; corporate actions |
| `/keepers` | Scrip's own keeper's report (reporting since, books watched and why each waits, sweeps since start, whether it posts Pyth updates), every keeper that has ever submitted a sweep from the receipts' `submitter` field (sweeps, books, converted, last), the five can/cannot lines, and how to run one |
| `/app` | the moment, live: the rule in one line ("10% of every arrival becomes SPYx."), a watching line (address, state, last sweep, allowance left, float), a warning line when the state needs one, Pause / Change / public-page toggle; the story since the first receipt (landed, became stock, units from receipts, worth today on Jupiter when the asset has a price, and the staircase of cumulative units); the register of stubs newest first, polled every 4 s from `/api/book/live/<owner>`; a dashed **ghost stub** while USDC sits above the watermark unswept; a new receipt prints at the top with the one motion moment; holdings, still-held, the pay link |
| `/@handle` | a person's register, read-only, for anyone — only after the owner turned "Make it public" on (`books.published`); or an organisation's page: pays in stock since, people paid, paid in all, grants vesting, the last runs, every payment as a row with its reason. `/book/[handle]` redirects here. `opengraph-image` is the share card for both |
| `/run/[id]` | a payroll run: label, payer, N of M paid, in all, every line a receipt with its reason. `opengraph-image` |
| `/grant/[pda]` | a grant read from the chain: units, bought for, the schedule as a bar, vested so far, next vest, every vest as a receipt, revoke/close for the payer. `opengraph-image` |
| `/floor` | the live tape over SSE: every stub as it prints, the share that landed while the NYSE was closed (`newYork`), the keepers' state, the corporate actions from the mint |
| `/app/holdings`, `/app/receipts`, `/app/statements`, `/app/statements/[ym]`, `/app/settings` | the register's pages: what the rule bought and whether it is held; every stub; a month as a document that prints (arithmetic on receipts, an empty month says so); allowance, float, the public page, Telegram, the handle |
| `/app/org`, `/app/org/pay`, `/app/org/runs`, `/app/org/grants`, `/app/org/people`, `/app/org/settings` | pay in stock: the organisation's home; one person with a split; a run from a CSV, one `signAll`, relayed line by line; grants opened in one transaction (memo, open, route, seal) and revoked or closed; everyone paid; an organisation handle, the public page, export |
| `/people`, `/teams`, `/grants`, `/company`, `/security`, `/bounties`, `/changelog`, `/brand`, `/actions` | the marketing map under the dark nav: three doors, the seven firsts, what a stranger can check (read from the chain and the build at request time), Scrip's own bounties from `content/bounties.json`, the changelog, the brand page, corporate actions |
| `/app/rule` | one question — "How much of every payment should become stock?" — answerable before any wallet is connected (the wallet is asked for at the moment of signing; the answer survives the popup in session storage) — 5 / 10 / 20 / another rate as large presets, the $500 example under it, the handle and the asset as two ruled rows, the attestation where the asset needs one; "what the rule may do" folded (allowance, float, cap, floor, tolerance, escalation); **one signature** (`start`: open + approve + float + enable in one transaction) for a new book; change, switch asset, re-approve, top up, turn off for an existing one |
| `/app/send` | pay a handle, an address, or make a claim link (a first share for an empty wallet). The request page is gone: the pay link takes `?amount=&reason=` |

# Part 3 — How it is configured and deployed

- `NEXT_PUBLIC_SOLANA_CLUSTER` selects the cluster; the cache file follows it
  (`var/scrip.devnet.db` today). Unset defaults to devnet.
- The assets on the registry are mainnet mints; the devnet build of the program accepts
  any mint, so devnet receipts show "Unrecognised mint" and raw units, and the ledger's
  units line says so rather than counting them.
- The keeper needs `SCRIP_KEEPER_KEYPAIR`, and on mainnet `PYTH_API_KEY`; it reports on
  `KEEPER_HEALTH_PORT`, which the app reads through `KEEPER_HEALTH_URL`.
- Claims are relayed by `SCRIP_RELAYER_KEYPAIR` (falls back to `SCRIP_CRANK_KEYPAIR`).
- `POST /api/maintenance` runs the watcher, the indexer, the book mirror, the crank and the
  refresh behind `SCRIP_MAINTENANCE_SECRET`; the ledger page also refreshes after it responds.

# Part 4 — Observed behaviour

## With `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, after the on-chain battery

`/ledger` renders, from the cache the indexer filled after the battery:

```
Receipts                 7        4 sweeps, 3 payments
Value converted          $72
Units delivered          7 receipts in mints not on the registry (a devnet stand-in).
Wallets with the rule on 2        3 books opened.
Keep-rate at 7 days      The first receipt is 7 days old on 22 Sep 2026.
Keep-rate at 30 days     The first receipt is 30 days old on 15 Oct 2026.
```

`/receipt/3NbSbm…Fq4w` (the first sweep) renders the stub: `$200 landed · 10% became ·
19745009 Dtzr… · 15 Sep 2026, 08:32 UTC · in @tu2exxh3's wallet`, "not attributed yet"
under From (the arrival was a mint-to, so no sender account fell), `Price $100.26 · Pyth ·
3 min old`, `Band ±$0.01`, `7 days measured 22 Sep 2026`, `30 days measured 15 Oct 2026`,
the receipt account, the transaction, the slot, the release id. `/receipt/4cmLEK…W9vw` (the
intake) renders `$5 paid · It became · 650000 Dtzr…`, `From FKfq2A…woJb`, `Paid $5`, `For
"shipped the receipt page on Tuesday"`.

At 375px the landing and the ledger scroll without horizontal overflow
(`document.documentElement.scrollWidth === 375`); the stats reflow to one column; the mode
pill sits on a paper scrim; the rail is a bottom bar.

The only console error on any page is the public devnet RPC answering 429 to the server,
which retries.

## The keeper

Started on devnet against the deployer key (`npm run keeper`), it logged its identity, the
program id, "hermes KEYLESS — mainnet sweeps will wait for a fresh price forever", its
balance, and "health on :8787/health". Within fifty seconds `GET /health` answered:

```
cluster devnet · hermes keyless · sweeps 0
2AzXot…My1m4  owner 31yq7K…KpkJ  lastReason "paused: the delegate is revoked"
6A1NH4…GwNX   owner 9WFNG2…aTdD  lastReason "The net inflow is below the rule's minimum."
```

Both are books the on-chain battery opened; the first is the one whose owner revoked in
the pause test. There is no Jupiter on devnet, so the keeper reports and syncs watermarks
there and sweeps only on mainnet.

Running it needed one dependency pin: the Pyth receiver SDK pulls `jito-ts`, which nests a
2023 `@solana/web3.js` that deep-imports `rpc-websockets` subpaths the 7.10+ and 9.x lines
no longer export. `rpc-websockets@7.9.0` is declared as a devDependency so npm hoists it
for that copy; the modern web3.js keeps its own nested 9.x.

## The production build

`npm run build` compiles every route: 6 static pages, 25 dynamic routes including the
opengraph image.

# Part 5 — What is not built, and what is blocked

- **A mainnet deploy.** 2.978378 SOL, measured on devnet on 2026-09-19 by deploying the real
  binary from a payer funded with exactly that; 2.9755 of it is a deposit `solana program
  close` returns. The deployer holds none.
- **A Pyth API key.** Hermes has required one since 2026-08-26; without it the keeper waits
  for a fresh price forever on mainnet, because the on-chain SPYX account is not kept fresh.
- **A paid RPC.** The public endpoints rate-limit the pages and the deploys.
- **A second keeper instance, a multisig on the upgrade authority, mixes, round-ups, the
  embedded-wallet door, the organisation surface** — after Stocklana, per `docs/scrip.md` §15.

# Appendix

## Addresses

| What | Address |
| --- | --- |
| Program (devnet) | `Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj` |
| Deployer | `FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` |
| USDC (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| SPYx (mainnet) | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| QQQx (mainnet) | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` |
| Oro GOLD (mainnet) | `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A` |
| Pyth receiver (both clusters) | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` |
| Pyth SPYX/USD (mainnet, pinned) | `jf8MarLKgBte4f3NWufbNpGRCuBfJLhuZPuFigvSQR2` |
| Pyth SOL/USD (both clusters) | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` |
| Pyth USDC/USD (both clusters) | `Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX` |

## Deployed

`https://scrip.80.225.209.190.sslip.io` — devnet (the grant build since 2026-09-16; the VM carries it since
2026-09-17), on the founder's VM beside other apps: pm2 `scrip-web`
(`next start -p 3300` behind nginx with a Let's Encrypt certificate) and `scrip-keeper` (reporting health on
:8787, keyless Hermes, so it posts no Pyth updates; on devnet the stand-in cannot be routed, so its sweeps are the
demo script's). `@scrip`, an organisation, is the front door's register. Details and the update procedure: `docs/deploy.md` §0.

## The front wallet

`anchor/.keys/front.json` (gitignored) is `BbDN31Q4qK53ddNuJnvpvWfC5UFMi87HGxQmuJobUv3q`, generated 2026-09-15 for the
front door on mainnet; unfunded. `npm run book -- start --key anchor/.keys/front.json --slug scrip --rate 1000`
opens its book in one signature on whichever cluster `.env.local` names; `npm run book -- publish --slug scrip`
turns its public page on. The runbook is `docs/deploy.md`. On devnet the front book is `@demo`.

## The devnet demo

`scripts/devnet-demo.ts` (`npm run demo:devnet -- setup | land <usd> | sweep | sign | status`)
opens a book for a persisted owner key (`anchor/.keys/demo.json`, gitignored) with two
stand-in mints, turns the rule on in one transaction, lands USDC, and sweeps it as the keeper
would — verified on chain against Pyth SOL/USD. Run on 2026-09-15: owner `Cg2QgBNBn4aE…`,
book `@demo`, a $200 arrival swept to 0.1970 stand-in units at $101.00 (receipt
`J16fA6DXLtrZX8efDrNWnSF1Cgut5Zfej2FPTzrE9ecu`, tx `4Lefy1jv…dPpJd`). A mint the registry
does not know is labelled **stand-in** on every surface on devnet, with its decimals read
from the mint; on mainnet it stays held.

## Example devnet signatures

Sweep `3NbSbmZdHUnZPgxHKRKq1HpNYsgomZRxc7VEAtVGdLk5BpwkS48LxkwyNYm7J7NCRmocexP3g53F7J55ek58Fq4w`;
intake `4cmLEK26S46soWCSBVQX9M8evJq5hQQ55kJadiF7sFtiUSFTNWUaFBtJd1iy8rpzZFGVLcVM9k1nvXKvB5uBW9vw`;
sponsored claim `5VKXs1zuQiicaQMKAH7KXE81UK6K8ooxxZdLMKFFFvMotSJ7YhhEkaUbE39Rd4RKQqtWWDH6sPwR6SL9CocsUeRo`.

## Commands

```bash
npm run dev            # next dev --turbopack
npm run build          # writes .next-build, never over a running server
npm run lint
npm run typecheck
npm run test           # 190+ offline tests
npm run anchor:test    # 43 Rust unit tests (devnet feature), 40 (mainnet), both builds
npm run test:devnet    # 19 on-chain tests through the program at NEXT_PUBLIC_SOLANA_RPC
npm run test:localnet  # the same 19 on a local validator with Pyth's accounts cloned
npm run test:registry  # every mint and pinned feed, read off mainnet
npm run keeper
```

# Part 5 — The company shell, observed 2026-09-16

Built from `docs/SCRIP-COMPANY-PLAN.md`, phases 2 to 5, against a local validator running
the grant build with Pyth's SOL/USD and USDC/USD accounts cloned from devnet.

## What was exercised on the local validator

`npm run test:localnet`, 19 tests: the eleven of 2026-09-15, plus an organisation register
(`kind = Org` reads back), a run of intakes sharing a `run_id` (each receipt carries it), a
grant opened and sealed in one transaction (escrow bought by the stand-in route, Grant
receipt to the recipient, float funded), a vest after the cliff (Vest receipt, the caller
repaid tip + rent from the float, `released_raw` advanced), a vest before the cliff refused
(`NothingToVest`), a revoke that returned the unvested part and a close that returned rent
and float, and a second active grant for the same payer.

Through the browser, signed in as the deployer (`@tu3wihm1org`, an organisation): a person
paid at `/app/org/pay` (receipt kind pay, reason on the stub), a run of two from a CSV
(`/run/1e675ef9bbfcc650af2fbfb80c07a42d`: 2 of 2 paid, $82 in all), a grant of $50 vesting
over 365 days (`/grant/A2DmieF8JZLfiuffaE2xLgEk9PG7bLEUHMvqpdpFPFcZ`), the organisation's
public page, the floor printing each of them live over SSE with "100% of arrivals while
Wall Street slept" (the validator runs at night), and the share cards for `/@handle`, the
run and the grant rendering from the same reads.

## What is on the surfaces, and what is not

- Every figure on every page is read from the chain or the cache of it; the stand-in mint
  is labelled "stand-in" on every surface, including the share cards.
- `/security` reads the program account, the ProgramData account and the built `.so` at
  request time; on the local validator the upgrade authority is the default key and the
  page says "none".
- Telegram is wired (`/api/notify/telegram`, `telegram_links`, one message per receipt from
  the indexer) and reports itself unconfigured until `TELEGRAM_BOT_TOKEN` is set.
- ⌘K opens a field on every page; `src/components/shell/jump-resolve.ts` decides from the
  shape of the text and a test reads the filesystem for every page it offers.
- The favicon, the home-screen icon, the 512-pixel maskable icon and the web manifest are
  routes drawing the stub glyph; the app installs to a phone's home screen at `/app`.
- A statement month with no receipt says so instead of a 404.

## Not done, and why

- **The devnet program is the grant build** since 2026-09-16 (slot 499,325,517,
  581,024 bytes). The front book is `@scrip`, an organisation; the `@demo` register of
  2026-09-15 no longer decodes and the old cache sits at `var/old/`. The first index against
  the public endpoint is slow by design (four calls a second); a paid RPC is what makes it
  quick, and the runbook says so.
- **Mainnet** waits, by the founder's instruction, for the whole plan and "our gut".
- **Milestones and share cards** are built (`src/lib/book/milestones.ts`, `/m/@handle/<id>`
  with its own card): the first receipt, the first whole share, ten receipts, thirty days
  kept, a thousand dollars in stock, each dated by the receipt that crossed it, plus the
  one arithmetic line about the next whole share.
- **A second organisation, two keepers, real registers through bounties** (plan §10): these
  are money and people, not code.

