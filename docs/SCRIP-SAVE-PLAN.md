# Scrip — save now, then every payment, then the match

The third transformation, 7 October 2026. It supersedes `SCRIP-COMPANY-PLAN.md` on the front
door, the words a person reads, and the order a person meets things in. The program, the
sweep, the keepers, pay in stock, gifts, grants and every existing receipt stay as they are.

> Save part of every dollar into stocks you own. Whoever pays you can match it.

---

## 1. The product, in the order a person meets it

1. **Save now.** Connect a wallet. If it was paid lately, the first line is "You received
   $250 on 6 Oct. Save 10%: $25", offered only when the wallet can spend that slice.
   Otherwise $5, $10 or $25, with $5 selected. Into the S&P 500 by default; Nvidia, Apple,
   Microsoft, Tesla and the Nasdaq 100 one tap away; search finds the rest of the catalogue.
   It is a plain Jupiter swap from the saver's USDC into the stock, in their own wallet, with
   the memo `scrip:save:v1` and the save mark. No program of Scrip's runs, so it works at a
   weekend. The receipt is read from the transaction.
2. **Save every payment.** Under that receipt, one ask: "Do this with every payment: 10%".
   This is the rule as it exists: a capped delegate, a keeper, a Pyth-checked sweep, on the
   eleven assets the chain can price (S&P 500, Nasdaq 100, Nvidia, Microsoft, Alphabet,
   Tesla, Meta, Apple, Amazon, Strategy, gold). The limit defaults to $200.
3. **Get matched.** A sponsor's Plan adds a capped share of every automatic save, in its own
   transaction after the save (`match_receipt`), so it can never hold up or undo one. Plans
   need the program upgrade below. Until then Scrip pays a labelled **Welcome bonus** through
   today's pay in stock, and nothing hand-paid is ever called a match.

**Scrip Curve** (Meteora) is a second source for the match: a launch preset whose trading
fees reach a savings pool through Meteora's Dynamic Fee Sharing. It lives at `/curve`, off
the main nav.

## 2. What stays, what moves, what is retired

- **Stays:** the program and its instruction set, sweeps, Pyth bounds, keepers, pay in
  stock, gifts, claims, grants, every existing receipt layout, non-custody, the revoke,
  per-asset disclosure. No Scrip token.
- **Moves to `/proof` (ink):** the floor, the tape, the keepers, corporate actions, the
  market band, the mechanism replay, keep-rate, the seven firsts, the live counters.
- **Retired from consumer surfaces:**

| Was | Is |
| --- | --- |
| Turn on the rule | Save $5 · Save 10% of every payment |
| Register | Your savings (the account is a "savings record" where one must be named) |
| Sweep, swept | Saved |
| Allowance | Limit: "Scrip can move at most $200" |
| Revoke, pause | Stop saving |
| SPYx, NVDAx as names | S&P 500, Nvidia; ticker and issuer in small type |
| Handle | Name, optional (an empty one is made from the address) |
| Keeper, watermark, float, slot, band, keep-rate | only on `/proof` and in Proof drawers |
| Floor, tape, printer | gone from consumer surfaces; the stub stays as the receipt's shape |
| 401(k), pension, guaranteed, floor price | never in product copy |

## 3. Design

Paper `#f7f5ef` on every consumer screen; ink only on `/proof`. One accent, `#2b4acb`. Green
only for money a sponsor added. Instrument Sans with tabular figures wherever people read;
Plex Mono only in Proof drawers and addresses. Body 17 px; targets at least 44 × 44 px;
motion only when something real arrives (the receipt prints). One primary button per screen,
and a trust line directly above every signature.

## 4. How a save is built and read

- `src/lib/save/build.ts` — `[compute limit, compute price, memo, open the stock account + mark,
  jupiter…]`, simulated before the wallet is asked; the compute limit is measured.
- `src/lib/save/mark.ts` — the mark is Scrip's program address for the seed `save`, carried
  read-only on the associated-token instruction (the Solana Pay reference convention), so
  `getSignaturesForAddress(mark)` lists every save without Scrip's database.
- `src/lib/save/parse.ts` — a save from its transaction alone: the fee payer's USDC fall, the
  stock that rose in an account they own, Jupiter's `SwapEvent`s for the route, the deposit if
  the stock account was opened.
- `src/lib/save/read.ts` — the receipt view; Pyth's price is read when the save is first seen
  and kept only if it was published within two minutes of the save.
- `src/lib/save/index-saves.ts` — the indexer, from the mark, with its own cursor.
- `src/lib/solana/tx-view.ts` — every reader of other people's transactions uses the RPC's
  parsed JSON, because mainnet carries v1 transactions web3.js cannot decode.
- `scripts/stock-catalogue.ts` → `src/lib/assets/catalogue.json` — the curated catalogue: three
  issuers, a route at $5 and $100, no restricted transfers.
- `scripts/save-dry-run.ts` — build and simulate a save for any wallet, never signed.

## 5. The program upgrade (only if it is rehearsed, multisig-ready and verified)

Add accounts and instructions only; no existing layout changes; every mainnet receipt stays
valid.

- `Plan ["plan", sponsor, plan_id]`: sponsor, plan stock mint, default rate, escalation,
  `match_bps`, monthly cap per member in USDC units, escrow owned by the Plan, budget left,
  status.
- `Member ["member", plan, owner]`: Invited or Active, period start, USDC matched this period,
  total matched, last matched slot.
- `open_plan` + `seal_plan` (the grant pattern, no Pyth), `top_up_plan`, `top_up_plan_direct`,
  `add_members`, `remove_member`, `close_plan` (sponsor only; close never touches a paid
  match), `accept_member` (in the same transaction as `enable_rule`).
- `match_receipt`, permissionless: only a sweep receipt of an Active member newer than the
  last matched; the receipt's slice × `match_bps` / 10,000 in the plan stock at a verified Pyth
  price plus band; limited by the escrow and the monthly cap; once per receipt; never a
  receipt from before joining; emits a Match event. `finish_sweep` does not change.
- Receipt events; `close_receipt` after the day-30 measurement; a separate `payer` signer.

Before it lands: a Squads 2-of-3 upgrade authority, about 3 SOL for the buffer, the battery
green, `solana-verify`. Agents prepare; the founder signs.

## 6. Scrip Curve

Checked first, read-only, and recorded in `docs/decisions.md`: whether a DBC config's fee
claimer can be a Dynamic Fee Sharing vault, who owns the partner's migrated DAMM v2 position,
and the keeper threshold for a USDC quote. If the vault cannot claim, a public claimer wallet,
said on the page.

Preset: quote USDC, a long flat curve, a fee that starts high and decays, creator fee 50%,
fees in the quote token, migration to DAMM v2 (OnlyB or Compounding), partner liquidity
permanently locked, claimer the vault (savings pool 90, Scrip 10). One demonstration launch,
named a demonstration, never called a Scrip token, low threshold, the manual migrator. No
public launch form. No wash trading. `/curve` off the nav, with the disclosure: "A launch is a
speculative token. Scrip makes no claim about its price; it guarantees only where its fees go."

## 7. The limits, said everywhere they matter

The whole slice is not enforced (the program checks the Pyth-bounded minimum). An automatic
save waits for a price at weekends; a save now does not. Issuers can freeze or move their
tokens. Not offered to US persons. Unaudited.
