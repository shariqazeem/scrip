# Webgold

**Web3 made assets programmable. Webgold makes ownership receivable.**

A receive book for real assets on Solana. Value arrives as gold and the market — in your own
wallet, never ours — because you earned it, were gifted it, or were sponsored into it. Every
arrival carries an on-chain receipt anyone can open: who paid, who received, how many grams,
and why.

```bash
npm install && npm run dev
```

## What runs today

| | |
| --- | --- |
| **Program** | `3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX` on **devnet**, upgradeable |
| **Instructions** | `open_book` · `set_policy` · `close_book` · `fund_payout` · `release_payout` · `claim_payout` · `cancel_payout` · `set_goal` · `withdraw_goal` |
| **Assets** | Oro GOLD (metal) and SPYx (the market), **mainnet mints**, read from the mint accounts themselves |
| **Prices** | Pyth, on chain, with a settle bound set per feed from what that feed measurably does |
| **Tests** | 254 offline, plus live batteries against mainnet mints, mainnet prices and the deployed program |

## Commands

```bash
npm run dev          # next dev --turbopack
npm run build        # writes to .next-build, never over a running server
npm run lint
npm run typecheck    # tsc --noEmit, strict
npm run test         # 254 offline tests
npm run anchor:build # build the program and sync its IDL into src/lib/anchor/

npm run test:registry # re-reads every registered mint from mainnet
npm run test:valuer   # checks SPYX/USD ÷ SPY/USD against the live multiplier
npm run test:devnet   # runs a real payout, claim and goal through the deployed program
```

## The four things worth reading first

**The multiplier is not the field called `multiplier`.** A Token-2022 ScaledUiAmount config
keeps the OLD value there and the newer one in `newMultiplier`, with a timestamp. On
2026-09-12 SPYx read `1.003909240011759` / `1.005714560286254`, effective three months in the
past — so the obvious read paints every SPYx balance 0.18% short, forever, with nothing about
the number looking wrong. `src/lib/corporate-actions/multiplier.ts`.

**A dividend is not a gain and a 4-for-1 split is not a 300% return.** Adjusted quantity is
always recomputed from the RAW balance, and a multiplier change never moves cost basis,
because basis here is dollars contributed from outside and neither event brings any in. The
DRIP convention was considered and rejected: it renders a dividend as a loss of exactly the
dividend. `src/lib/corporate-actions/reconcile.ts`.

**Keep-rate cannot be faked.** Its denominator is stamped on chain by the program in the same
instruction that moved the value; its numerator is the recipient's own public balance. It
holds rather than reports when a matured cohort was never measured, because "they spent it
all" and "we did not look" are opposite claims. `src/lib/keep-rate.ts`.

**Silver failed the test the spec demanded it pass.** Every silver instrument on Solana is a
fund tracker or a miner's equity, so the default mix is 70% gold and 30% the market rather
than 50/20/30. Full evidence in `docs/decisions.md`.

## Where things are

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | the canonical spec — product, architecture, invariants, and the drift log |
| `docs/decisions.md` | what was locked and why. Bring a new fact to reopen one |
| `docs/build-order.md` | dependency order. There are no versions |
| `docs/product.md` · `docs/architecture.md` · `docs/strategy.md` · `docs/research.md` | the product, the shape, the plan, the sources |
| `src/lib/assets/registry.ts` | every asset, read off mainnet, with per-row issuer powers |
| `anchor/programs/webgold/` | the program: the rule and the record, never the vault |
| `src/styles/tokens.css` | the single design-token source of truth |
| `.claude/skills/webgold-ui/` | the UI skill — invoke before building any surface |

## Honesty, before you ask

- **Self-custody here means not our custody.** Tokenized equity mints carry an issuer
  permanent delegate and a pause authority. Oro GOLD does not — it is a plain SPL mint with no
  freeze authority — which is why the disclosure is per row rather than a banner.
- **Dividends are reinvested, not paid.** There is no equity income on chain and Webgold will
  never show an expected one.
- **Savings-grade, not stable.** Gold and equities fall as well as rise.

Competing in: Stocklana (closes 18 Sep) and Colosseum Crypto World's Fair (closes 12 Oct).
