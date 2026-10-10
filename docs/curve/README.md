# Scrip Curve — launch a token priced in a stock; its fees match savers

A launch preset on Meteora's Dynamic Bonding Curve, live on scrip.work, where the quote is a
tokenized stock: the Nasdaq 100, the S&P 500, Tesla or Nvidia (xStocks `QQQx`, `SPYx`, `TSLAx`,
`NVDAx`). Every buy pays in the stock and every trading fee is stock. The savers' share of each fee
goes straight from the curve into a **Scrip Plan in the same stock**, and the Plan, enforced by
Scrip's Solana program, matches real people's automatic savings from it. At graduation the pool
moves to Meteora DAMM v2 as launch token / stock, all liquidity locked, and its fees keep reaching
the Plan.

- Launch: [scrip.work/curve/launch](https://scrip.work/curve/launch), from your own wallet, one approval.
- Every launch, read from the chain: [scrip.work/curve](https://scrip.work/curve), each with its own page to buy (with USDC) and sell (for the stock).

## The money trail

```
a trade on the curve          fee charged in the stock (25% → 1% over the first hour)
        │
        ▼  Meteora DBC claim_trading_fee, receiver = that stock's Plan   one instruction, no wallet between
Scrip Plan escrow             the Plan PDA's own account in that stock
        │
        ▼  Scrip program match_receipt, after each member's automatic save
a saver's wallet              "Added by @scrip" on the save's receipt, in green

at graduation                 DBC → DAMM v2 (launch token / stock), every position locked
        │
        ├─ DAMM v2 claim_position_fee, receiver = the Plan            the locked partner position's fees
        └─ DBC withdraw_migration_fee → forwarded to the Plan          the partner's 2% graduation fee
```

The fee claimer is Scrip's saving service. Every 30 minutes it walks **every launch on every Scrip
Curve config, read from the chain** (`launchesOnChain`: `getPoolsByConfig` for each config, names
from each token's Metaplex metadata), because anyone can launch on a config, from scrip.work or with
Meteora's SDK. Meteora lets a claimer choose the receiver, and this one only ever names the Plan in
the curve's own stock (`src/lib/curve/deployed.json`). A Scrip program instruction that claims into
the Plan by itself, with no signer to trust, is the next step.

## On scrip.work

| | |
| --- | --- |
| `/curve` | every launch with its progress to graduation, the money trail, each stock's Plan and every fee that reached it, the preset, the proof |
| `/curve/launch` | the stock, a name and a symbol, who keeps the fee, an optional first buy in USDC; one approval |
| `/curve/<pool>` | a launch read from the chain: progress, the fee this second, the savers' share waiting; buy with USDC, sell for the stock |
| `/api/curve/tx` | builds a launch, a buy or a sale (`src/lib/curve/build.ts`), simulated before the wallet is asked |
| `/api/curve/send` | relays what the wallet (and, for a launch, the new token's own key) signed; only DBC, DAMM v2 or Jupiter transactions |
| `/api/curve/meta`, `/api/curve/icon` | a token's metadata and image, made by Scrip from its name, symbol and stock: no uploads, no free text |

A launch's mint key is made in the browser and signs **after** the wallet, so the wallet sees the
transaction first and can add its own checks (Phantom's Lighthouse), and the server never holds it.
A first buy pays in USDC: Jupiter turns it into the stock, and the curve is bought with the route's
guaranteed minimum in the same approval; when that is too long for one transaction it goes as two
under one prompt. Names that read like a stock (Tesla, Nasdaq, TSLA, "shares") or like Scrip are
refused: a launch is a token priced in a stock, not a share of it.

## Why stocks

- **Stock-pairs.** Meteora asks for launch mechanics tuned to tokenized stocks. A launch priced in
  one makes every fee a share of that stock, and a Plan's escrow holds the same stock, so a fee
  needs no swap to reach a saver.
- **Open to anyone today.** xStocks carry a permanent delegate and a pause authority, which Meteora
  allows only with a token badge. Both badges (DBC and DAMM v2) exist on mainnet for all four,
  read on 10 October. The badge is passed when the config is created and again when the pool is
  created (`InvalidTokenBadge` otherwise).
- **Not a vault.** Meteora's Dynamic Fee Sharing vault accepts only plain mints (transfer-fee and
  metadata extensions) and refuses an xStock. The receiver-claim does the same job with fewer
  moving parts.

## The presets (`src/lib/curve/preset.ts`)

| | |
| --- | --- |
| Quote | `QQQx`, `SPYx`, `TSLAx`, `NVDAx`: Token-2022, 8 decimals, issued by Backed (xStocks) |
| Fee | exponential schedule 25% → 1% over 3,600 s (60 periods), dynamic fee on, collected in the quote. An early bot pays the savers; a holder does not |
| Who keeps it | Meteora keeps 20% of each fee. Public: of the rest, half to the launcher, half to the Plan. Demonstration: all of the rest to the Plan |
| Graduation | public about $850 of the stock (1.15 QQQx, 1.1 SPYx, 2.25 TSLAx, 3.75 NVDAx at 10 October's prices), above the $750 Meteora's own migration keepers need for a stock quote, so Meteora graduates it; a demonstration about $15, graduated with `curve.ts migrate`. 2% graduation fee; DAMM v2 collecting in the quote |
| Liquidity | partner and creator positions 100% permanently locked |
| Token | SPL, 6 decimals, 1B supply, immutable metadata, no mint authority |

## Set it up, then launch from the site

```bash
npx tsx --conditions=react-server scripts/curve.ts setup --keypair <sponsor key>
```

opens a Plan in each stock and a public config in each, plus a demonstration config in the Nasdaq
100, every step simulated first and recorded in `src/lib/curve/deployed.json`. Then launch on
scrip.work/curve/launch, or with `curve.ts launch`, which builds the very transaction the site
does. `curve.ts buy | sell | migrate | fees | status` cover the rest.

## Proven before it ran

```bash
npm run curve:rehearse
```

Boots a local validator holding Meteora's mainnet DBC and DAMM v2 programs, Metaplex, Token-2022,
the Nasdaq 100 and Tesla mints and Meteora's badges for each, with Scrip's program at its real id,
and runs the commands with throwaway keys, through the site's own builders: every Plan and config
in two stocks, an invitation, a demonstration launch in the Nasdaq 100 and a public launch in Tesla
(each with a first buy), a buy at the opening fee, a sale back into the curve for the stock, the
fees into each stock's Plan, a buy that fills the curve, graduation, the graduation fee into the
Plan, a trade on the graduated pool, and its fee into the Plan. `scripts/curve-simulate.ts`
simulates every config, every Plan and a first buy's Jupiter swap against mainnet itself.

Two things the first rehearsal found that the docs did not say: a pool on a badged quote needs the
badge at pool creation too, and an exact-in buy larger than the curve's remaining room is refused
(`InsufficientLiquidity`), so a buy uses DBC's partial-fill swap. On mainnet Meteora's DBC pool
authority pays a graduation's rent (it holds tens of SOL); the rehearsal funds its local copy.

## Honesty

A launch is a speculative token, not a stock and not a share of one, and it belongs to whoever
launched it. Scrip makes no claim about any launch's price; it guarantees only where its fees go.
Scrip's own demonstration launch is plainly a demonstration, never called a Scrip token, not
promoted, and every buy on it is the founder's own. Not offered to US persons.
