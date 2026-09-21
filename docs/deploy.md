# Scrip on mainnet — the runbook

> Real money, real receipts. Everything below is what a real-money app needs and nothing a
> demo needs. Written 2026-09-15; every step was exercised on devnet the same day, and the
> mainnet steps are the same commands with the cluster switched.

## What it takes

| | Amount | Why |
| --- | --- | --- |
| Program rent | about 3.0 SOL | 585,384 bytes at `--max-len 585384`. **A deposit, not a fee**: it is returned in full by `solana program close`, and it is what makes the program's bytes rent-exempt forever |
| Deploy buffer | about 3.0 SOL | written during the deploy and **refunded when it lands**; the deployer only has to hold it at the time |
| Deployer fees | about 0.05 SOL | the deploy's write transactions with a priority fee. This is the only part actually spent |
| Keeper wallet | 0.1 SOL and a USDC account | fees, Pyth posts (rent comes back), the slice passes through it |
| Front wallet | 0.06 SOL and some USDC | float 0.05 SOL, the book's rent, the watermark |
| Pyth API key | free tier | Hermes has required one since 2026-08-26; the keeper posts fully verified updates |
| RPC | Helius or Triton | the public endpoint rate-limits the live poll; receipts must resolve forever, so archival |
| A host with a disk | one small VPS | the cache is SQLite; Vercel's filesystem is not persistent |

## 0. What is deployed today (16 September 2026)

The founder's VM (`ubuntu@80.225.209.190`, Ubuntu 24.04, arm64, 2 vCPU, 12 GB) already
hosts other apps under pm2 and nginx; Scrip sits beside them, untouched:

| | |
| --- | --- |
| URL | **`https://scrip.work`** since 2026-09-21 (also `www.scrip.work`, and `scrip.80.225.209.190.sslip.io` kept on the same certificate). nginx → 127.0.0.1:3300, Let's Encrypt via certbot, expires 20 Dec 2026. `NEXT_PUBLIC_SITE_URL` is the name every OG card and Solana Pay link is built from, so it is a rebuild, not a restart |
| Code | `/home/ubuntu/scrip`, synced with rsync from the repo (no git on the box); `.next-build` built there with Node 22 (nvm) |
| Processes | pm2 `scrip-web` (`next start -p 3300`) and `scrip-keeper` (tsx, sourcing `.env.local`); both saved in pm2's list |
| Cluster | **mainnet-beta since 2026-09-21** — `@scrip` (an organisation) on the front door, program `Fbp8fBdC…A16gj`. One key per service: `keeper1.json` and `keeper2.json` for the two keepers, `service.json` for the relayer and crank. The upgrade authority is **not on this box** and never will be. Health on :8787 and :8788 |
| Cache | `/home/ubuntu/scrip/var/scrip.mainnet-beta.db`, copied from the founder's machine after a WAL checkpoint. The devnet env is kept at `.env.local.devnet.bak` |
| Env | `/home/ubuntu/scrip/.env.local` (mode 600): cluster, site URL, front book, the devnet pay-in mint, session and maintenance secrets, key paths |
| Config | `deploy/ecosystem.vm.cjs` in the repo is the pm2 file installed as `ecosystem.config.cjs` |

To update: rsync the repo (same excludes as the first sync), then on the box, **with nvm's
Node 22 on PATH**, `npm install && npm run build`, and restart from the config file:

```bash
ssh -i ~/Documents/ssh-key3.key ubuntu@80.225.209.190
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
cd ~/scrip && npm install --no-audit --no-fund && npm run build
pm2 delete scrip-web scrip-keeper; pm2 start ecosystem.config.cjs; pm2 save
```

**Never `pm2 restart … --update-env` from a plain SSH shell.** It replaces the process
environment with that shell's, whose PATH finds the system Node 20; `next start` then runs
under Node 20 while `better-sqlite3` was built for Node 22, and every page 500s with
"Module did not self-register". Starting from `ecosystem.config.cjs` pins the interpreter
and the PATH, which is why the deploy goes through the file and not through flags. If it
has already happened: `npm rebuild better-sqlite3` under Node 22, then delete and start
from the file.
Switching to mainnet is the runbook below with this host: change `.env.local`, rebuild, restart.

**Done on 16 September 2026:** the grant build is on devnet (slot 499,325,517), the front
book is `@scrip` — an organisation — and the old `@demo` register no longer decodes, so the
old cache was set aside (`var/old/`). A VM update now carries all of it; the order for any
future layout change is the same: fund the deployer, redeploy (§0.1), let the cache
re-index, then rsync, build and restart.

### 0.1 Redeploy the program on devnet

The devnet allocation is 640,000 bytes and the grant build is 581,024, so no `extend` is
needed; the deploy still writes a buffer account of the program's size, about 4 SOL,
refunded when the upgrade lands. Keep about 4.5 SOL on
`FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` before starting (faucet.solana.com, or a
wallet's devnet balance), then:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
npm run anchor:build:devnet                                   # anchor/target/deploy/scrip-devnet.so
solana program deploy anchor/target/deploy/scrip-devnet.so \
  --program-id anchor/.keys/scrip-program-keypair.json -k anchor/.keys/deployer.json -u devnet
cp .env.local.devnet .env.local                               # back from the local validator
mv anchor/.keys/demo.json anchor/.keys/demo.<old date>.json   # the old state names accounts that no longer decode
mv var/scrip.devnet.db* var/old/                              # so does the cache
DEMO_SLUG=scrip DEMO_KIND=org npx tsx scripts/devnet-demo.ts setup
npx tsx scripts/devnet-demo.ts land 200 && npx tsx scripts/devnet-demo.ts sweep
npm run test:devnet                                           # 19 tests through the new program
```

`setup` prints the new stand-in USDC mint: put it in `.env.local` as
`NEXT_PUBLIC_DEVNET_USDC_MINT` (and in `.env.local.devnet`), then `POST /api/maintenance`
once so the indexer caches the new register, and `npm run book -- publish --slug scrip`.
Accounts written by the previous layout are skipped by the indexer rather than guessed at.
The buffer's rent returns to the deployer on success; on a failed deploy,
`solana program close --buffers -k anchor/.keys/deployer.json -u devnet` recovers it.

**The endpoint's budget is per IP, not per process.** A browser tab polling a register every
four seconds, a keeper, and `npm run test:devnet` are one budget on `api.devnet.solana.com`:
the battery fails with "Connection rate limits exceeded" while a dev server is up, and
passes 19/19 with nothing else running. Stop the dev server before the battery, or point one
of them at a paid endpoint.

**A public RPC will not carry the first index.** `api.devnet.solana.com` allows about four
calls a second before it answers 429, and Scrip holds itself to that (`src/lib/solana/limiter.ts`);
walking every signature the program ever wrote takes many minutes at that rate, and page
loads queue behind it. Set `NEXT_PUBLIC_SOLANA_RPC` to a paid endpoint before the first
maintenance run, or expect the backfill to take a long time. `SOLANA_RPC_RPS` and
`SOLANA_RPC_CONCURRENCY` override the budget when an endpoint allows more.

### 0.2 A local validator, for work that must not wait for devnet

```bash
scripts/localnet.sh start      # solana-test-validator with Pyth SOL/USD, USDC/USD and the memo program cloned from devnet
npm run test:localnet          # deploys the devnet-feature build and runs the 19-test battery (the clones age out after ~10 minutes: restart first)
scripts/localnet.sh stop
```

`.env.local` for the validator: `NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899` and
`SCRIP_DB_PATH=var/scrip.localnet.db`, cluster still `devnet` (the program's devnet
feature). `.env.local.devnet` holds the devnet settings to copy back.

## 1. The host

One VPS (Hetzner CX22, Fly machine with a volume, or similar), Node 22, `pm2`, Caddy for TLS.

```bash
git clone <this repository> scrip && cd scrip
npm ci
cp .env.example .env.local   # then fill it in, below
npm run build                # writes .next-build
pm2 start "NEXT_DIST_DIR=.next-build npx next start -p 3000" --name scrip-web
pm2 start "npm run keeper" --name scrip-keeper
pm2 save
```

Caddyfile:

```
scrip.example.com {
  reverse_proxy localhost:3000
}
```

`var/` holds `scrip.mainnet-beta.db`; back it up like any file, or lose only speed: a re-index
rebuilds it from the chain.

## 2. `.env.local` on the host

```
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=…
NEXT_PUBLIC_SITE_URL=https://scrip.example.com
NEXT_PUBLIC_FRONT_BOOK=scrip
SCRIP_KEEPER_KEYPAIR=/home/ubuntu/scrip/anchor/.keys/keeper1.json
SCRIP_RELAYER_KEYPAIR=/home/ubuntu/scrip/anchor/.keys/service.json
SCRIP_CRANK_KEYPAIR=/home/ubuntu/scrip/anchor/.keys/service.json
SCRIP_MAINTENANCE_SECRET=<long random>
KEEPER_HEALTH_URL=http://localhost:8787/health
PYTH_API_KEY=…
```

## 3. Deploy the program

The mainnet `.so` is built with the registry compiled in and no devnet feature.
`npm run anchor:build` writes `anchor/target/deploy/scrip-mainnet.so` — the file this section
deploys — and syncs the IDL. Check its size and hash with `npm run preflight -- --mainnet`
before signing anything: a stale `scrip-mainnet.so` would put an older program on mainnet,
and the app would then fail to decode the accounts it writes.

```bash
npm run anchor:build
npm run preflight -- --mainnet          # size, hash, what the deployer must hold
solana program deploy anchor/target/deploy/scrip-mainnet.so \
  --program-id anchor/.keys/scrip-program-keypair.json \
  -k ~/scrip-authority.json -u mainnet-beta \
  --max-len 585384 --with-compute-unit-price 20000 --max-sign-attempts 60
solana program show Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj -u mainnet-beta
```

`--max-len` is the allocation and the deposit scales with it, so allocate exactly the build:
headroom bought now is the same money as `solana program extend <program> <bytes>` bought at
the upgrade that needs it, and only then if the binary has grown. If a deploy fails part-way,
`solana program close --buffers -k ~/scrip-authority.json -u mainnet-beta` returns the
buffer's rent.

**Where the money goes — measured, not estimated.** 2.978378 SOL, proved on devnet on
2026-09-19 by funding a throwaway payer with exactly 2.9794 SOL and deploying this same
585,384-byte binary: it landed in 18 seconds and left 0.00102232 SOL, and the dumped bytes
matched the file's sha256 at full length.

| | SOL | |
| --- | --- | --- |
| programdata rent | 2.974630 | deposit |
| program account rent | 0.000833 | deposit |
| base fees, 582 transactions and 583 signatures | 0.002915 | spent |
| `--with-compute-unit-price 10000`, measured | 0.000172 | spent |

**The buffer is not a second 2.97 SOL.** `DeployWithMaxDataLen` moves the buffer's lamports
into the programdata account, so the peak requirement equals the total — which is why 2.9794
was enough. Fund 2.99 and stop. Both rents are a deposit: `solana program close` returned
2.97462956 SOL in that same test, twice.

The binary is already built for size — `opt-level = "z"`, `lto = "fat"`, `codegen-units = 1`,
`panic = "abort"` — and stripping its symbols was measured at 3,824 bytes, which is not worth
an unverified change to the money program.

**The authority is the money.** `-k ~/scrip-authority.json` makes that key the upgrade
authority: the only key that can push a new program, and the only key that can close it and
reclaim the 2.975 SOL. It lives on the founder's machine, outside the repository, backed up
as a written seed phrase — **never on the VM, never in an env file, never in git**. Everything
on the host runs as `keeper1`, `keeper2` or `service`, which hold small balances and cannot
touch the program. `npm run preflight -- --mainnet` fails if any service variable resolves to
the authority, or if any file the host sources names its keypair.

The program id is already in `Anchor.toml`, `declare_id!` and the IDL; a test fails if the
three ever disagree.

## 4. The keeper

```bash
solana-keygen new -o anchor/.keys/keeper1.json     # and keeper2.json, and service.json
# fund each keeper with 0.05 SOL, the service key with 0.03, and receive any USDC once
# so the keeper's USDC account exists. A keeper ends every sweep about 489,000 lamports
# ahead — KEEPER_TIP is 500,000 and its fees are about 11,000 — so this is a float to
# front the first sweep, not a budget.
pm2 restart scrip-keeper
curl localhost:8787/health
```

Two keepers racing is the design, and Scrip runs two: `deploy/ecosystem.vm.cjs` starts
`scrip-keeper` and `scrip-keeper-2`, each with its own key, its own health port (8787, 8788)
and its own poll, both reading the same `.env.local`. Point the app at both — the variable
takes a list:

```
KEEPER_HEALTH_URL=http://127.0.0.1:8787/health,http://127.0.0.1:8788/health
```

`/keepers` then says "Scrip runs 2 keepers, racing" and names each by the receipts it wrote.
Whichever lands a sweep first writes the receipt; the other's transaction fails, because the
program refuses to sweep the same arrival twice. A third, run by somebody who is not the
founder, needs nothing from us: `npm run keeper` with their own key.

## 5. The front wallet

The wallet on the front door is a real book anyone can pay. Its key is
`anchor/.keys/front.json` (gitignored); the founder holds it.

```bash
# fund it: 0.06 SOL, then send it any USDC so its USDC account exists
npm run book -- start --key anchor/.keys/front.json --slug scrip --rate 1000
curl -X POST -H "authorization: Bearer $SCRIP_MAINTENANCE_SECRET" https://scrip.example.com/api/maintenance
npm run book -- publish --slug scrip
```

The front door then shows `@scrip` live with a Solana Pay QR: anyone who scans it sends a
normal USDC transfer to that address, and the receipt prints on the page within seconds.

## 5.1 Telegram, one message per receipt

```
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_BOT_USERNAME=<the bot's handle without @>
TELEGRAM_WEBHOOK_SECRET=<long random>
```

Then register the webhook once, so the bot hears the one-time code a person sends it:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://scrip.example.com/api/notify/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Settings shows "Link Telegram" only when the token is set; the indexer sends a message for
every receipt whose recipient linked a chat. Without a token the page says notifications are
not configured on this deployment.

## 5.2 The organisation

`@scrip` is an organisation handle: `npm run book -- start --key anchor/.keys/front.json --slug scrip --rate 1000 --kind org`
opens it (or the settings page, signed in as that wallet, "Open an organisation"). The
bounties in `content/bounties.json` are paid from `/app/org/pay` with the bounty's id as the
reason; every payment appears on `/@scrip` labelled as Scrip's own.

## 6. Prove it, then film it

**`npm run test:devnet` cannot be pointed at mainnet.** The battery mints its own stand-in
USDC and asset and opens a book on them; the mainnet build refuses any mint that is not on
the registry (`AssetNotRegistered`) and any pay-in mint but USDC. That refusal is the point
of the mainnet build, so the proof on mainnet is real money in small amounts, in this order.
Each step writes one receipt; open each one before doing the next.

```bash
npm run preflight -- --mainnet          # nothing should say FAIL, nothing should be WAITing
# 1. the register, and the rule, in one signature
npm run book -- start --key anchor/.keys/front.json --slug scrip --kind org --rate 1000
# 2. an arrival: send $2 of real USDC to the front wallet from a phone, then watch
npm run keeper                          # in its own terminal, with PYTH_API_KEY set
```

| Step | What to send | What must appear |
| --- | --- | --- |
| 1 | — | `@scrip` on `/@scrip`; the rule on at 10% |
| 2 | $2 USDC to the front wallet | a ghost stub, then a sweep receipt: $0.20 became SPYx, priced against Pyth, routed by Jupiter |
| 3 | pay `$1` to a second wallet from `/app/org/pay` | a pay receipt with its reason, on `/@scrip` and the floor |
| 4 | gift `$1` to an address with no register | a claim link; claim it from an empty wallet |
| 5 | a `$5` grant, cliff 0, duration 2 days | a grant receipt, then a vest receipt the keeper writes |

Only step 2 exercises something no test can: the real Jupiter route inside the atomic
sandwich, with the program's introspection guard around it. If the fill is below the Pyth
minimum the whole transaction reverts and nothing moves, which is the behaviour to want.

Then the definition of done in `docs/scrip.md` §11, with a phone: send USDC to the founder's
normal address and watch `/app`; pay `/pay/<handle>` by QR; open the receipt with no session;
open `/ledger`; open `/keepers`.

## 6.1 The rehearsal, timed

`npm run rehearse` runs this whole sequence against a local validator: it costs nothing, it
can be repeated, and it is the same commands in the same order. Measured on the founder's
machine, 18 September 2026 — every step green:

| | Step | Time |
| --- | --- | --- |
| 1 | a validator, and the program deployed onto it | 4s |
| 2 | what a deploy would cost, and what is missing (`preflight`) | 0s |
| 3 | the organisation's register, rule on, **one signature** | 6s |
| 4 | money lands | 2s |
| 5 | the keeper sweeps it | 8s |
| 6 | index what the chain now holds | 1s |
| 7 | publish the page | 0s |
| 8 | every money path on chain (the 19-test battery: pay, gift, claim, grant, vest, revoke, close) | 44s |
| 9 | the production build | 23s |
| | **from nothing to a site printing receipts** | **88s** |

Serving that state, the front door printed `@scrip`'s $200 arrival as 0.1877 units, the floor
counted twelve receipts and "100% of arrivals while Wall Street slept", and the tape carried
the grant and its vests.

**What differs on mainnet.** The mints are the registry's real ones instead of stand-ins, the
route is Jupiter instead of a transfer from the keeper's stash, and the price is the real
SPYX/USD feed instead of a cloned SOL/USD. The commands and their order do not differ, and
neither does step 3: a register and a live rule are still one signature.

**What the rehearsal cannot prove.** Jupiter has no devnet and no local validator, so the
route inside the atomic sandwich is only ever proven by step 2 of §6 with real money. Budget
an hour for the whole bring-up on the day, not because it takes an hour, but because the
first real sweep is the one thing nobody has seen yet.

## 7. Real wallets before judging

Receipts mature at 7 days. Submissions close 25 September: a rule turned on by 18 September
shows a 7-day keep-rate at submission, and one turned on by the 25th shows it during
judging. Four or five real wallets with real inflows are worth more than any feature.

## What is deliberately not automated

- Funding: every SOL and USDC transfer above is the founder's, from a wallet the founder
  controls. Nothing here moves money on anyone's behalf.
- The multisig: after Stocklana.
