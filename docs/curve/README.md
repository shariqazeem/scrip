# Scrip Curve — launches that fund savings

A launch preset on Meteora's Dynamic Bonding Curve whose fees become real people's savings.
The config's fee claimer is a Meteora Dynamic Fee Sharing vault; the vault's recipients are a
Savings Pool (90%) and Scrip (10%); the Savings Pool pays its share to savers as S&P 500, in
their own wallets, through Scrip's pay in stock, and every such receipt names the launch and
the claim transaction it came from.

Any launchpad can copy the route: change the two recipients, keep the rest.

## The trail

1. **A trade** on a Scrip Curve launch pays the curve's fee in USDC (collect-fee mode
   QuoteToken). Meteora keeps its protocol share; of the rest, the launcher gets 50%
   (`creatorTradingFeePercentage`) and the config's fee claimer the other half.
2. **The fee claimer is a vault**: a Dynamic Fee Sharing PDA vault
   (`["fee_vault", base, USDC]` under `dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh`), recipients
   fixed at creation.
3. **Claimed by integration**: `fund_by_claiming_fee` makes the vault sign DBC's own
   `claim_trading_fee`, so fees move pool → vault with no wallet in between. After graduation,
   `withdraw_migration_fee` and DAMM v2 `claim_position_fee` for the locked partner position
   do the same: DBC hands the partner's position NFT to the config's fee claimer.
4. **Into savings**: the Savings Pool takes its share (`claim_fee`) and pays a saver in stock
   with `pay`, reason "Welcome bonus from Scrip, paid by the fees of <launch>. Claim: <sig>".

## The preset (`src/lib/curve/preset.ts`)

| | |
| --- | --- |
| Quote | USDC. The vault accepts plain SPL mints and Token-2022 with only TransferFeeConfig, MetadataPointer and TokenMetadata; tokenized stocks are refused |
| Fee | exponential scheduler, 25% falling to 1% over the first hour; dynamic fee on; collected in USDC |
| Creator | 50% of the partner-side trading fee |
| Graduation | DAMM v2 (`MET_DAMM_V2`), customizable migrated-pool fee 1%, collected in USDC; 750 USDC for the public preset (Meteora's keepers migrate on their own), 30 for a demonstration (manual migrator) |
| Migration fee | 2% of the quote at graduation, half to the vault |
| Liquidity | partner 50% and creator 50%, both permanently locked |
| Token | SPL, 6 decimals, 1,000,000,000 supply, immutable metadata, no mint authority |

`src/lib/curve/preset.test.ts` runs Meteora's own `validateConfigParameters` on both kinds.

## Running it

Everything is `npx tsx --conditions=react-server scripts/curve.ts <command>`. Writes simulate
first and stop on `--dry-run`. Keypairs are read from files you name and never printed; the
addresses created are written to `src/lib/curve/deployed.json`, which `/curve` reads.

```bash
# what each step does and costs, read from mainnet now
npx tsx --conditions=react-server scripts/curve.ts plan

# 1. the vault: Savings Pool 90, Scrip 10 (recipients can never change)
npx tsx --conditions=react-server scripts/curve.ts vault --keypair ~/scrip-curve-operator.json --pool <SAVINGS_POOL_ADDRESS> --scrip <SCRIP_ADDRESS>

# 2. the demonstration config, fee claimer = the vault
npx tsx --conditions=react-server scripts/curve.ts config --keypair ~/scrip-curve-operator.json --kind demonstration

# 3. a demonstration launch: never called a Scrip token, no roadmap, no promotion
npx tsx --conditions=react-server scripts/curve.ts launch --keypair ~/scrip-curve-operator.json --kind demonstration --name "Savings Demonstration One" --symbol DEMO1 --uri https://scrip.work/curve/demo1.json --first-buy 5

# 4. once the curve completes, graduate it (or use migrator.meteora.ag)
npx tsx --conditions=react-server scripts/curve.ts migrate --keypair ~/scrip-curve-operator.json --pool <POOL>

# 5. the fees into the vault, then the Savings Pool's share out of it
npx tsx --conditions=react-server scripts/curve.ts claim --keypair ~/scrip-savings-pool.json --pool <POOL>
npx tsx --conditions=react-server scripts/curve.ts collect --keypair ~/scrip-savings-pool.json

# 6. the share, into a saver's stock, on a receipt that names the launch and the claim
npx tsx --conditions=react-server scripts/curve.ts pay --keypair ~/scrip-savings-pool.json --to <SAVER> --usd 1 --launch <POOL> --claim <CLAIM_SIG>

npx tsx --conditions=react-server scripts/curve.ts status
```

## What is checked

Read-only on 7 October 2026, from Meteora's code and docs (details in `docs/decisions.md`):
the vault can be a config's fee claimer; the partner's DAMM v2 position goes to the fee claimer
at graduation; the migration fee is withdrawn by the fee claimer; the keepers' USDC threshold
is 750. The vault and both configs were simulated against Meteora's live mainnet programs.

## What it never does

No wash trading: one demonstration launch, a dev buy, and whatever real trades happen. No
public launch form: launches are by invitation, so nobody sells a token under Scrip's name. No
claim about a launch's price: **a launch is a speculative token. Scrip makes no claim about its
price; it guarantees only where its fees go.**
