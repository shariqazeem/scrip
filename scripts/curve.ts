/**
 * SCRIP CURVE, FROM THE FOUNDER'S MACHINE — the Plans and configs in each stock, and the steps a
 * demonstration needs that a browser cannot do (graduating a small curve, moving fees by hand).
 * Launches, buys and sales are built by the same code scrip.work uses (`src/lib/curve/build.ts`),
 * so what this signs is what the site's wallet prompt shows.
 *
 *   npx tsx --conditions=react-server scripts/curve.ts <command> [flags]
 *
 *   plan                                                  what each step does and costs; no key
 *   setup       --keypair SPONSOR [--stocks QQQx,SPYx,TSLAx,NVDAx] [--demonstration QQQx]
 *                                                         every Plan and config still missing, in one go
 *   plan-open   --keypair SPONSOR --stock S [--match 50] [--cap 5] [--rate 10] [--name "…"]
 *   plan-invite --keypair SPONSOR --stock S --members A,B,…   invite savers; each accepts in the app
 *   config      --keypair K --stock S --kind public|demonstration
 *   launch      --keypair K --stock S --kind public|demonstration --name N --symbol X
 *               [--first-buy-usd 5 | --first-buy-quote 0.006]
 *   buy         --keypair K --pool POOL (--usd 26 | --quote 0.03)
 *   sell        --keypair K --pool POOL (--tokens RAW | --all)
 *   migrate     --keypair K --pool POOL                   graduate a completed curve to DAMM v2
 *   fees        --keypair CLAIMER [--pool POOL]           every fee waiting, into its stock's Plan
 *   status                                                the Plans, the configs and every launch, live
 *
 * Every write is simulated first and only then signed and sent; `--dry-run` stops after the
 * simulation. A keypair is read from the file named and never printed; only public keys and
 * signatures are, and only those are written back to `src/lib/curve/deployed.json`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const DEPLOYED_PATH = join(process.cwd(), "src/lib/curve/deployed.json");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const cmd = process.argv[2] ?? "plan";
  const web3 = await import("@solana/web3.js");
  const { Connection, Keypair, PublicKey, ComputeBudgetProgram, Transaction, VersionedTransaction } = web3;
  type Kp = InstanceType<typeof Keypair>;
  const { DAMM_V2_CUSTOMIZABLE_CONFIG, DBC_PROGRAM_ID, PRESET, THRESHOLD, CURVE_STOCKS, isCurveStock, curveQuote, scripCurveConfig, tokenBadge } = await import("@/lib/curve/preset");
  type CurveStock = import("@/lib/curve/preset").CurveStock;
  type CurveKind = import("@/lib/curve/preset").CurveKind;
  const { deriveDammV2PoolAddress, derivePositionAddress, derivePositionNftAccount } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const claims = await import("@/lib/curve/claims");
  const build = await import("@/lib/curve/build");
  const { launchAt, launchesOnChain, partnerPositionOf, curveClient } = await import("@/lib/curve/launches");
  const { configsOf } = await import("@/lib/curve/deployed");
  const { memoIx } = await import("@/lib/intake/instructions");
  const { addMemberIx, openPlanIx, planEscrow, planPda } = await import("@/lib/plan/instructions");
  const { newReleaseId } = await import("@/lib/solana/program");

  const rpc = process.env.SOLANA_MAINNET_RPC?.trim().replace(/"/g, "") || process.env.CURVE_RPC?.trim() || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const dbc = curveClient(conn);
  type DeployedFile = {
    cluster: string;
    feeClaimer: string | null;
    plans: Partial<Record<CurveStock, { address: string; sponsor: string; planId: string; escrow: string; createdSig: string }>>;
    configs: Partial<Record<CurveStock, Partial<Record<CurveKind, { address: string; createdSig: string }>>>>;
    launches: Array<Record<string, unknown> & { pool: string; symbol: string; stock: CurveStock }>;
    lookupTable?: string | null;
  };
  const deployedPath = process.env.CURVE_DEPLOYED?.trim() || DEPLOYED_PATH;
  const deployed = JSON.parse(readFileSync(deployedPath, "utf8")) as DeployedFile;
  deployed.plans ??= {};
  deployed.configs ??= {};
  deployed.launches ??= [];
  const save = () => writeFileSync(deployedPath, `${JSON.stringify(deployed, null, 2)}\n`);
  // This file's configs, not the repository's: a rehearsal writes its own record.
  const configs = () => configsOf(deployed as unknown as import("@/lib/curve/deployed").Deployed);
  const unitsOf = (stock: CurveStock, raw: bigint | number | string) => (Number(raw) / 10 ** curveQuote(stock).decimals).toFixed(curveQuote(stock).decimals);
  const stockFlag = (): CurveStock => {
    const s = flag("stock") ?? "QQQx";
    if (!isCurveStock(s)) throw new Error(`--stock must be one of ${CURVE_STOCKS.join(", ")}.`);
    return s;
  };

  const loadKeypair = (): Kp => {
    const path = flag("keypair");
    if (!path) throw new Error("--keypair <path to a keypair file> is required for this command");
    const secret = Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? "~"), "utf8")) as number[]);
    const kp = Keypair.fromSecretKey(secret);
    console.log(`signing as ${kp.publicKey.toBase58()}`);
    return kp;
  };

  /** Simulate, then sign and send, then wait for it: every legacy write goes through here. */
  const send = async (tx: InstanceType<typeof Transaction>, payer: Kp, extra: Kp[], what: string) => {
    if (!tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId))) {
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
    }
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...extra);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) {
      console.log((sim.value.logs ?? []).slice(-14).join("\n"));
      throw new Error(`${what}: the simulation failed (${JSON.stringify(sim.value.err)}). Nothing was sent.`);
    }
    console.log(`${what}: simulation ok, ${sim.value.unitsConsumed} compute units`);
    if (has("dry-run")) return "dry-run";
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
    const done = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (done.value.err) throw new Error(`${what}: landed but failed (${JSON.stringify(done.value.err)}): ${sig}`);
    console.log(`${what}: ${sig}`);
    return sig;
  };

  /** The site's own transactions (base64, unsigned): signed by whoever they need, simulated, sent in order. */
  const sendBuilt = async (transactions: readonly string[], signers: Kp[], what: string): Promise<string[]> => {
    const sigs: string[] = [];
    for (const [i, b64] of transactions.entries()) {
      const label = transactions.length > 1 ? `${what} (${i + 1} of ${transactions.length})` : what;
      const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.message.recentBlockhash = blockhash;
      const needed = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
      tx.sign(signers.filter((s) => needed.some((k) => k.equals(s.publicKey))));
      const sim = await conn.simulateTransaction(tx, { commitment: "confirmed" });
      if (sim.value.err) {
        console.log((sim.value.logs ?? []).slice(-14).join("\n"));
        throw new Error(`${label}: the simulation failed (${JSON.stringify(sim.value.err)}). Nothing was sent.`);
      }
      console.log(`${label}: simulation ok, ${sim.value.unitsConsumed} compute units, ${tx.serialize().length} bytes`);
      if (has("dry-run")) {
        sigs.push("dry-run");
        continue;
      }
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
      const done = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (done.value.err) throw new Error(`${label}: landed but failed (${JSON.stringify(done.value.err)}): ${sig}`);
      console.log(`${label}: ${sig}`);
      sigs.push(sig);
    }
    return sigs;
  };

  const chainLaunch = async () => {
    const pool = flag("pool");
    if (!pool) throw new Error("--pool <a Scrip Curve launch's pool address> is required.");
    const found = await launchAt(conn, pool, configs());
    if (!found.ok) throw new Error(found.why);
    if (!found.value) throw new Error("That pool is not on a Scrip Curve config.");
    return found.value;
  };

  const openPlan = async (sponsor: Kp, stock: CurveStock) => {
    if (deployed.plans[stock]) {
      console.log(`${stock}: a Plan already exists, ${deployed.plans[stock]!.address}`);
      return;
    }
    const planId = newReleaseId();
    const terms = {
      matchBps: Math.round(Number(flag("match") ?? "50") * 100),
      monthlyCapUsdc: BigInt(Math.round(Number(flag("cap") ?? "5") * 1e6)),
      defaultRateBps: Math.round(Number(flag("rate") ?? "10") * 100),
      escalateBps: 0,
    };
    const asset = curveQuote(stock);
    const name = flag("name") ?? `Scrip Curve: launch fees in ${asset.symbol} matching savers`;
    const open = openPlanIx({ sponsor: sponsor.publicKey, planId, asset, terms, reason: name });
    if (!open.ok) throw new Error(open.why);
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), memoIx(sponsor.publicKey, name), open.value);
    const sig = await send(tx, sponsor, [], `open the ${stock} Plan "${name}"`);
    const address = planPda(sponsor.publicKey, planId).toBase58();
    const escrow = planEscrow(sponsor.publicKey, planId, asset).toBase58();
    console.log(`${stock} plan ${address}, escrow ${escrow}`);
    if (sig !== "dry-run") {
      deployed.plans[stock] = { address, sponsor: sponsor.publicKey.toBase58(), planId: Buffer.from(planId).toString("hex"), escrow, createdSig: sig };
      save();
    }
  };

  const makeConfig = async (payer: Kp, stock: CurveStock, kind: CurveKind) => {
    if (deployed.configs[stock]?.[kind]) {
      console.log(`${stock} ${kind}: a config already exists, ${deployed.configs[stock]![kind]!.address}`);
      return;
    }
    if (!deployed.feeClaimer) throw new Error("deployed.json names no fee claimer.");
    const quoteMint = new PublicKey(curveQuote(stock).mint);
    const config = Keypair.generate();
    const tx = await dbc.partner.createConfig({
      config: config.publicKey,
      feeClaimer: new PublicKey(deployed.feeClaimer),
      leftoverReceiver: payer.publicKey,
      quoteMint,
      payer: payer.publicKey,
      tokenBadge: tokenBadge(DBC_PROGRAM_ID, quoteMint),
      ...scripCurveConfig(kind, stock),
    });
    const sig = await send(tx, payer, [config], `create the ${kind} config, priced in ${stock}`);
    console.log(`${stock} ${kind} config ${config.publicKey.toBase58()}`);
    if (sig !== "dry-run") {
      deployed.configs[stock] = { ...(deployed.configs[stock] ?? {}), [kind]: { address: config.publicKey.toBase58(), createdSig: sig } };
      save();
    }
  };

  /** The lookup table of every account a launch names that never changes: made once, extended as configs are added. */
  const ensureTable = async (k: Kp) => {
    const { AddressLookupTableProgram } = web3;
    const { curveTableAddresses } = await import("@/lib/curve/table");
    if (!deployed.lookupTable) {
      const slot = await conn.getSlot("finalized");
      const [create, address] = AddressLookupTableProgram.createLookupTable({ authority: k.publicKey, payer: k.publicKey, recentSlot: slot });
      const sig = await send(new Transaction().add(create), k, [], "create the lookup table");
      if (sig === "dry-run") return;
      deployed.lookupTable = address.toBase58();
      save();
    }
    const table = new PublicKey(deployed.lookupTable);
    const current = (await conn.getAddressLookupTable(table, { commitment: "confirmed" })).value;
    const have = new Set((current?.state.addresses ?? []).map((a) => a.toBase58()));
    const missing = curveTableAddresses(deployed as unknown as import("@/lib/curve/deployed").Deployed).filter((a) => !have.has(a.toBase58()));
    for (let i = 0; i < missing.length; i += 20) {
      const chunk = missing.slice(i, i + 20);
      const ix = AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: k.publicKey, payer: k.publicKey, addresses: chunk });
      await send(new Transaction().add(ix), k, [], `add ${chunk.length} accounts to the lookup table`);
    }
    console.log(`lookup table ${table.toBase58()}: ${have.size + missing.length} accounts`);
  };

  switch (cmd) {
    case "plan": {
      const rent = async (bytes: number) => (await conn.getMinimumBalanceForRentExemption(bytes)) / 1e9;
      console.log("Scrip Curve, priced in a stock, step by step (rent read from the cluster now):");
      console.log(`  1. setup        a Plan in each stock (about ${(await rent(300)).toFixed(4)} SOL each with its escrow) and a public config in each (about ${(await rent(1100)).toFixed(4)} SOL each), plus a demonstration config in the Nasdaq 100. Fee claimer ${deployed.feeClaimer}.`);
      console.log("  2. plan-invite  savers to match; each accepts in the app (a new saver's start accepts by itself).");
      console.log("  3. launch       on scrip.work/curve/launch from a wallet, or here; optionally with a first buy.");
      console.log(`  4. buy          after the fee has fallen from ${PRESET.startingFeeBps / 100}% to ${PRESET.endingFeeBps / 100}% (an hour), fill a demonstration curve.`);
      console.log("  5. migrate      a demonstration curve to DAMM v2 (Meteora's keepers graduate the public ones themselves).");
      console.log("  6. fees         every fee waiting goes into its stock's Plan; Scrip's saving service also does this by itself.");
      return;
    }
    case "setup": {
      const k = loadKeypair();
      const stocks = (flag("stocks") ?? CURVE_STOCKS.join(",")).split(",").map((s) => s.trim());
      const demos = (flag("demonstration") ?? "QQQx").split(",").map((s) => s.trim()).filter(Boolean);
      for (const s of [...stocks, ...demos]) if (!isCurveStock(s)) throw new Error(`${s} is not one of ${CURVE_STOCKS.join(", ")}.`);
      for (const s of stocks as CurveStock[]) await openPlan(k, s);
      for (const s of stocks as CurveStock[]) await makeConfig(k, s, "public");
      for (const s of demos as CurveStock[]) await makeConfig(k, s, "demonstration");
      await ensureTable(k);
      console.log("set up: every Plan, config and the lookup table are recorded in src/lib/curve/deployed.json");
      return;
    }
    case "plan-open":
      await openPlan(loadKeypair(), stockFlag());
      return;
    case "plan-invite": {
      const sponsor = loadKeypair();
      const stock = stockFlag();
      const plan = deployed.plans[stock];
      if (!plan) throw new Error(`No ${stock} Plan yet: run \`setup\` or \`plan-open --stock ${stock}\` first.`);
      const members = (flag("members") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (members.length === 0 || members.length > 10) throw new Error("--members A,B,… (one to ten addresses)");
      const tx = new Transaction();
      for (const m of members) {
        const ix = addMemberIx({ sponsor: sponsor.publicKey, plan: new PublicKey(plan.address), owner: new PublicKey(m) });
        if (!ix.ok) throw new Error(ix.why);
        tx.add(ix.value);
      }
      await send(tx, sponsor, [], `invite ${members.length} saver${members.length === 1 ? "" : "s"} to the ${stock} Plan`);
      return;
    }
    case "config":
      await makeConfig(loadKeypair(), stockFlag(), (flag("kind") ?? "public") as CurveKind);
      return;
    case "launch": {
      const stock = stockFlag();
      const kind = (flag("kind") ?? "public") as CurveKind;
      const name = flag("name");
      const symbol = flag("symbol");
      if (!name || !symbol) throw new Error("--name and --symbol are required.");
      const payer = loadKeypair();
      const mint = Keypair.generate();
      const firstStockRaw = flag("first-buy-quote") ? BigInt(Math.round(Number(flag("first-buy-quote")) * 10 ** curveQuote(stock).decimals)) : undefined;
      const firstUsdc = Number(flag("first-buy-usd") ?? "0") > 0 ? BigInt(Math.round(Number(flag("first-buy-usd")) * 1e6)) : undefined;
      const built = await build.buildLaunch(conn, { owner: payer.publicKey, stock, kind, config: deployed.configs[stock]?.[kind]?.address, table: deployed.lookupTable, name, symbol, mint: mint.publicKey, site: process.env.NEXT_PUBLIC_SITE_URL?.replace(/"/g, "") || "https://scrip.work", firstStockRaw, firstUsdc });
      if (!built.ok) throw new Error(built.why);
      const sigs = await sendBuilt(built.value.transactions, [payer, mint], `launch ${name} (${symbol}), priced in ${stock}${built.value.firstStockRaw > 0n ? `, with a first buy of ${unitsOf(stock, built.value.firstStockRaw)}` : ""}`);
      console.log(`pool ${built.value.pool}, mint ${mint.publicKey.toBase58()}`);
      if (!sigs.includes("dry-run")) {
        deployed.launches.push({ name, symbol: symbol.toUpperCase(), kind, stock, config: deployed.configs[stock]![kind]!.address, baseMint: mint.publicKey.toBase58(), pool: built.value.pool, createdSig: sigs[sigs.length - 1]!, createdUnix: Math.floor(Date.now() / 1000) });
        save();
      }
      return;
    }
    case "buy": {
      // A plain buy on a launch: the founder's own, and said so wherever it is shown. The fee falls
      // from 25% to 1% over the first hour, so a buy that only fills a curve waits.
      const launch = await chainLaunch();
      const payer = loadKeypair();
      const stockRaw = flag("quote") ? BigInt(Math.round(Number(flag("quote")) * 10 ** curveQuote(launch.stock).decimals)) : undefined;
      const usdc = Number(flag("usd") ?? "0") > 0 ? BigInt(Math.round(Number(flag("usd")) * 1e6)) : undefined;
      if (!stockRaw && !usdc) throw new Error("--usd <USDC to spend> or --quote <stock to spend> is required.");
      const built = await build.buildBuy(conn, { owner: payer.publicKey, launch, table: deployed.lookupTable, usdc, stockRaw });
      if (!built.ok) throw new Error(built.why);
      await sendBuilt(built.value.transactions, [payer], `buy ${launch.symbol ?? launch.pool.slice(0, 6)} (at least ${built.value.tokensMin} base units)`);
      return;
    }
    case "sell": {
      const launch = await chainLaunch();
      const payer = loadKeypair();
      let tokens = flag("tokens") ? BigInt(flag("tokens")!) : 0n;
      if (has("all")) {
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const acc = getAssociatedTokenAddressSync(new PublicKey(launch.baseMint), payer.publicKey);
        tokens = BigInt((await conn.getTokenAccountBalance(acc, "confirmed")).value.amount);
      }
      const built = await build.buildSell(conn, { owner: payer.publicKey, launch, table: deployed.lookupTable, tokensRaw: tokens });
      if (!built.ok) throw new Error(built.why);
      await sendBuilt(built.value.transactions, [payer], `sell ${tokens} base units of ${launch.symbol ?? "the launch"} for ${launch.stock}`);
      return;
    }
    case "migrate": {
      const launch = await chainLaunch();
      const payer = loadKeypair();
      const out = await dbc.migration.migrateToDammV2({ payer: payer.publicKey, pool: new PublicKey(launch.pool), dammConfig: DAMM_V2_CUSTOMIZABLE_CONFIG });
      const sig = await send(out.transaction, payer, [out.firstPositionNftKeypair, out.secondPositionNftKeypair], `graduate ${launch.name ?? launch.pool}`);
      const dammPool = deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_CONFIG, new PublicKey(launch.baseMint), new PublicKey(curveQuote(launch.stock).mint));
      console.log(`graduated pool ${dammPool.toBase58()}`);
      const recorded = deployed.launches.find((l) => l.pool === launch.pool);
      if (recorded && sig !== "dry-run" && deployed.feeClaimer) {
        // DBC hands the partner's position NFT to the config's fee claimer. Rather than trust the
        // ordering, read which NFT the claimer now holds.
        let partnerNft = out.secondPositionNftKeypair.publicKey;
        for (const kp of [out.firstPositionNftKeypair, out.secondPositionNftKeypair]) {
          const acc = await conn.getParsedAccountInfo(derivePositionNftAccount(kp.publicKey), "confirmed");
          const owner = (acc.value?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed?.info?.owner;
          if (owner === deployed.feeClaimer) partnerNft = kp.publicKey;
        }
        Object.assign(recorded, {
          migratedSig: sig,
          dammPool: dammPool.toBase58(),
          partnerPosition: derivePositionAddress(partnerNft).toBase58(),
          partnerPositionNftAccount: derivePositionNftAccount(partnerNft).toBase58(),
        });
        save();
      }
      return;
    }
    case "fees": {
      const claimer = loadKeypair();
      if (deployed.feeClaimer && claimer.publicKey.toBase58() !== deployed.feeClaimer) throw new Error(`--keypair must be the fee claimer, ${deployed.feeClaimer}.`);
      const all = await launchesOnChain(conn, configs());
      if (!all.ok) throw new Error(all.why);
      const launches = flag("pool") ? all.value.filter((l) => l.pool === flag("pool")) : all.value;
      for (const launch of launches) {
        const plan = deployed.plans[launch.stock];
        const label = `${launch.symbol ?? launch.pool.slice(0, 6)} (${launch.stock})`;
        if (!plan) {
          console.log(`${label}: no ${launch.stock} Plan yet`);
          continue;
        }
        const partner = launch.dammPool ? await partnerPositionOf(conn, launch.dammPool, claimer.publicKey.toBase58()) : null;
        const source = { pool: launch.pool, stock: launch.stock, dammPool: launch.dammPool, partner };
        const waiting = await claims.feesWaiting(conn, source);
        if (!waiting.ok) {
          console.log(`${label}: ${waiting.why}`);
          continue;
        }
        const w = waiting.value;
        console.log(`${label}: ${unitsOf(launch.stock, w.onCurve)} on the curve, ${unitsOf(launch.stock, w.onPosition)} on the graduated position`);
        if (w.onCurve > 0n) {
          const tx = await claims.curveFeeToPlan(conn, { pool: launch.pool, claimer: claimer.publicKey, plan: new PublicKey(plan.address), amount: w.onCurve });
          if (!tx.ok) throw new Error(tx.why);
          await send(tx.value, claimer, [], `${label}: the curve's fee, straight into the ${launch.stock} Plan`);
        }
        if (w.graduationFeeWaiting) {
          const quoteAccount = claims.claimerQuoteAccount(claimer.publicKey, launch.stock);
          const before = BigInt((await conn.getTokenAccountBalance(quoteAccount).catch(() => null))?.value.amount ?? "0");
          const tx = await claims.migrationFeeWithdraw(conn, { pool: launch.pool, claimer: claimer.publicKey });
          if (!tx.ok) throw new Error(tx.why);
          const sig = await send(tx.value, claimer, [], `${label}: the partner's graduation fee`);
          if (sig !== "dry-run") {
            const after = BigInt((await conn.getTokenAccountBalance(quoteAccount, "confirmed")).value.amount);
            if (after > before) {
              const fwd = new Transaction().add(claims.forwardToPlan({ claimer: claimer.publicKey, escrow: new PublicKey(plan.escrow), amount: after - before, stock: launch.stock }));
              const fsig = await send(fwd, claimer, [], `${label}: ${unitsOf(launch.stock, after - before)} of graduation fee into the Plan`);
              const recorded = deployed.launches.find((l) => l.pool === launch.pool);
              if (fsig !== "dry-run" && recorded) {
                Object.assign(recorded, { migrationFeeSig: fsig });
                save();
              }
            }
          }
        }
        if (w.onPosition > 0n) {
          const tx = await claims.positionFeeToPlan(conn, { source, claimer: claimer.publicKey, plan: new PublicKey(plan.address) });
          if (!tx.ok) throw new Error(tx.why);
          await send(tx.value, claimer, [], `${label}: the graduated pool's fee, straight into the ${launch.stock} Plan`);
        }
      }
      for (const [stock, plan] of Object.entries(deployed.plans) as Array<[CurveStock, { escrow: string }]>) {
        // Raw units, the same the program counts; a wallet's display multiplies by the issuer's multiplier.
        const bal = await conn.getTokenAccountBalance(new PublicKey(plan.escrow)).catch(() => null);
        console.log(`the ${stock} Plan's escrow now holds ${bal ? unitsOf(stock, bal.value.amount) : "unknown"}`);
      }
      return;
    }
    case "status": {
      console.log(`fee claimer: ${deployed.feeClaimer ?? "none"}`);
      for (const stock of CURVE_STOCKS) {
        const plan = deployed.plans[stock];
        if (plan) {
          const bal = await conn.getTokenAccountBalance(new PublicKey(plan.escrow)).catch(() => null);
          console.log(`${stock} plan ${plan.address}: escrow holds ${bal ? unitsOf(stock, bal.value.amount) : "unknown"}`);
        }
        for (const [kind, c] of Object.entries(deployed.configs[stock] ?? {})) console.log(`${stock} ${kind} config: ${c!.address}`);
      }
      const all = await launchesOnChain(conn, configs());
      if (!all.ok) throw new Error(all.why);
      for (const l of all.value) {
        console.log(`launch ${l.name ?? "?"} (${l.symbol ?? "?"}), ${l.stock} ${l.kind}: ${l.pool}`);
        console.log(`  ${unitsOf(l.stock, l.quoteReserveRaw)} of ${THRESHOLD[l.kind][l.stock]} ${l.stock}, savers' fee waiting ${unitsOf(l.stock, l.partnerFeeRaw)}, graduated ${l.migrated ? `yes (${l.dammPool})` : "no"}`);
      }
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run with no command for the plan.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});
