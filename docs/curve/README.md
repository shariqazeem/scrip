# Scrip Curve — launches priced in the Nasdaq 100, whose fees match savers

A launch preset on Meteora's Dynamic Bonding Curve where the quote is a tokenized stock, the
Nasdaq 100 (xStocks `QQQx`), so every buy pays in stock and every trading fee is stock. Each fee
goes straight from the curve into a **Scrip Plan**, and the Plan, enforced by Scrip's Solana
program, matches real people's automatic savings from it. At graduation the pool moves to Meteora
DAMM v2 as launch token / Nasdaq 100, all liquidity locked, and its fees keep reaching the Plan.

Live page: [scrip.work/curve](https://scrip.work/curve), read from the chain.

## The money trail

```
a trade on the curve          fee charged in QQQx (25% → 1% over the first hour)
        │
        ▼  Meteora DBC claim_trading_fee, receiver = the Plan        one instruction, no wallet between
Scrip Plan escrow             the Plan PDA's own QQQx account
        │
        ▼  Scrip program match_receipt, after each member's automatic save
a saver's wallet              "Added by @scrip" on the save's receipt, in green

at graduation                 DBC → DAMM v2 (launch token / QQQx), every position locked
        │
        ├─ DAMM v2 claim_position_fee, receiver = the Plan            the locked partner position's fees
        └─ DBC withdraw_migration_fee → forwarded to the Plan          the partner's 2% graduation fee
```

The fee claimer is Scrip's saving service; it signs the claims every 30 minutes
(`src/keeper/index.ts`, `launchFeesToPlan`). Meteora lets a claimer choose the receiver, and this
one only ever names the Plan in `src/lib/curve/deployed.json`. A Scrip program instruction that
claims into the Plan by itself, with no signer to trust, is the next step.

## Why the Nasdaq 100

- **Stock-pairs.** Meteora asks for launch mechanics tuned to tokenized stocks. A launch priced in
  one makes every fee a share of the index, and a Plan's escrow holds the same stock, so a fee
  needs no swap to reach a saver.
- **Permissionless today.** xStocks carry a permanent delegate and a pause authority, which
  Meteora allows only with a token badge. Both exist on mainnet for `QQQx` (DBC and DAMM v2),
  and for SPYx, TSLAx and NVDAx. The badge is passed when the config is created and again when
  the pool is created (`InvalidTokenBadge` otherwise).
- **Not a vault.** Meteora's Dynamic Fee Sharing vault accepts only plain mints (transfer-fee and
  metadata extensions) and refuses an xStock. The receiver-claim does the same job with fewer
  moving parts.

## The preset (`src/lib/curve/preset.ts`)

| | |
| --- | --- |
| Quote | `QQQx`, 8 decimals, Token-2022 |
| Fee | exponential schedule 25% → 1% over 3,600 s (60 periods), dynamic fee on, collected in the quote. A sniper pays the savers; a holder does not |
| Creator share | none on a demonstration (every partner fee to savers); 50% on the public preset |
| Graduation | 0.04 QQQx for a demonstration (~$30), 1 QQQx public; 2% graduation fee; DAMM v2 collecting in the quote |
| Liquidity | partner and creator positions 100% permanently locked |
| Token | SPL, 6 decimals, 1B supply, immutable metadata, no mint authority |

## Run it

```bash
npx tsx --conditions=react-server scripts/curve.ts plan
```

The founder's mainnet sequence, every command simulated first: `plan-open` → `plan-invite` →
`config` → `launch --first-buy-usd 5` → `buy --usd 27` (a partial fill) → `migrate` → `fees`
(or let the saving service do it) → `status`.

## Proven before it ran

```bash
npm run curve:rehearse
```

Boots a local validator holding Meteora's mainnet DBC and DAMM v2 programs, Metaplex,
Token-2022, the Nasdaq 100 mint and both badges, with Scrip's program at its real id, and runs
the exact commands above with throwaway keys: the Plan, an invitation, the config, a launch with
a first buy, a buy at the opening fee, the fees into the Plan, a buy that fills the curve,
graduation, the graduation fee into the Plan, a trade on the graduated pool, and its fee into the
Plan. On 9 October every step passed and the Plan held exactly the sum of the fees
(0.01006792 QQQx). `scripts/curve-simulate.ts` simulates the config and the Plan against mainnet
itself.

Two things the rehearsal found that the docs did not say: a pool on a badged quote needs the badge
at pool creation too, and an exact-in buy larger than the curve's remaining room is refused
(`InsufficientLiquidity`), so the filling buy uses DBC's partial-fill swap. On mainnet Meteora's
DBC pool authority pays a graduation's rent (it holds tens of SOL); the rehearsal funds its local
copy the same way.

## Honesty

A launch is a speculative token. Scrip makes no claim about its price; it guarantees only where
its fees go. A demonstration launch exists to show the route, is never called a Scrip token, is
not promoted, and every buy on it is the founder's own.
