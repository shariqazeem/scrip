/**
 * SCRIP CURVE, FROM THE FOUNDER'S MACHINE — Scrip's Plan, the preset config priced in the
 * Nasdaq 100, a demonstration launch, its graduation, and the claims that move its fees into the
 * Plan that matches savers.
 *
 *   npx tsx --conditions=react-server scripts/curve.ts <command> [flags]
 *
 *   plan                                               what each step does and costs; no key
 *   plan-open   --keypair SPONSOR [--match 50] [--cap 5] [--rate 10] [--name "…"]
 *                                                      the Plan every launch fee goes to
 *   plan-invite --keypair SPONSOR --members A,B,…      invite savers; each accepts in the app
 *   config      --keypair K --kind demonstration|public
 *                                                      a launch config priced in the Nasdaq 100
 *   launch      --keypair K --kind demonstration --name N --symbol X --uri U
 *               [--first-buy-usd 5 | --first-buy-quote 0.006]
 *   buy         --keypair K --pool POOL (--usd 26 | --quote 0.03)
 *   migrate     --keypair K --pool POOL                graduate a completed curve to DAMM v2
 *   fees        --keypair CLAIMER [--pool POOL]        every fee waiting, into the Plan
 *   status                                             the Plan, the configs and every launch, live
 *
 * Every write builds the transaction with Meteora's own SDKs (or Scrip's instruction builders),
 * simulates it, and only then signs and sends; `--dry-run` stops after the simulation. A keypair
 * is read from the file named and never printed; only public keys and signatures are, and only
 * those are written back to `src/lib/curve/deployed.json`.
 *
 * Buys pay in the Nasdaq 100. With `--usd`, USDC is first swapped into the Nasdaq 100 through
 * Jupiter (its own transaction), and the curve is then bought with exactly what arrived.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEPLOYED_PATH = join(process.cwd(), "src/lib/curve/deployed.json");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const cmd = process.argv[2] ?? "plan";
  const web3 = await import("@solana/web3.js");
  const { Connection, Keypair, PublicKey, ComputeBudgetProgram, Transaction, TransactionMessage, VersionedTransaction } = web3;
  const BN = (await import("bn.js")).default;
  const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const { SwapMode, deriveDbcPoolAddress, derivePositionAddress, derivePositionNftAccount, deriveDammV2PoolAddress } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const { CURVE_QUOTE, CURVE_QUOTE_MINT, DAMM_V2_CUSTOMIZABLE_CONFIG, DBC_PROGRAM_ID, PRESET, THRESHOLD_QUOTE, scripCurveConfig, tokenBadge } = await import("@/lib/curve/preset");
  const claims = await import("@/lib/curve/claims");
  const { memoIx } = await import("@/lib/intake/instructions");
  const { addMemberIx, openPlanIx, planEscrow, planPda } = await import("@/lib/plan/instructions");
  const { newReleaseId } = await import("@/lib/solana/program");
  const jup = await import("@/lib/jupiter/client");

  const rpc = process.env.SOLANA_MAINNET_RPC?.trim() || process.env.CURVE_RPC?.trim() || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const dbc = claims.curveClient(conn);
  type Mutable<T> = { -readonly [K in keyof T]: T[K] };
  type DeployedFile = Mutable<import("@/lib/curve/deployed").Deployed> & {
    configs: Record<string, { address: string; createdSig: string }>;
    launches: Array<Mutable<import("@/lib/curve/deployed").Launch>>;
  };
  const deployedPath = process.env.CURVE_DEPLOYED?.trim() || DEPLOYED_PATH;
  const deployed = JSON.parse(readFileSync(deployedPath, "utf8")) as DeployedFile;
  const save = () => writeFileSync(deployedPath, `${JSON.stringify(deployed, null, 2)}\n`);
  const quoteUnits = (raw: bigint | number | string) => (Number(raw) / 10 ** CURVE_QUOTE.decimals).toFixed(CURVE_QUOTE.decimals);

  const loadKeypair = (): InstanceType<typeof Keypair> => {
    const path = flag("keypair");
    if (!path) throw new Error("--keypair <path to a keypair file> is required for this command");
    const secret = Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? "~"), "utf8")) as number[]);
    const kp = Keypair.fromSecretKey(secret);
    console.log(`signing as ${kp.publicKey.toBase58()}`);
    return kp;
  };

  /** Simulate, then sign and send, then wait for it: one place every legacy write goes through. */
  const send = async (tx: InstanceType<typeof Transaction>, payer: InstanceType<typeof Keypair>, extra: Array<InstanceType<typeof Keypair>>, what: string) => {
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

  /** USDC into the Nasdaq 100 through Jupiter, in the signer's own account: what arrived, in base units. */
  const usdcToQuote = async (owner: InstanceType<typeof Keypair>, usd: number): Promise<bigint> => {
    const amount = BigInt(Math.round(usd * 1e6));
    const q = await jup.quote({ inputMint: USDC, outputMint: CURVE_QUOTE.mint, amount, slippageBps: 100, maxAccounts: 40 });
    if (!q.ok) throw new Error(q.why);
    const account = getAssociatedTokenAddressSync(CURVE_QUOTE_MINT, owner.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const ixs = await jup.swapInstructions({ quote: q.value, userPublicKey: owner.publicKey, destinationTokenAccount: account });
    if (!ixs.ok) throw new Error(ixs.why);
    const alts = await jup.lookupTables(conn, ixs.value.lookupTableAddresses);
    if (!alts.ok) throw new Error(alts.why);
    const before = BigInt((await conn.getTokenAccountBalance(account).catch(() => null))?.value.amount ?? "0");
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const { createAssociatedTokenAccountIdempotentInstruction } = await import("@solana/spl-token");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
          createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, account, owner.publicKey, CURVE_QUOTE_MINT, TOKEN_2022_PROGRAM_ID),
          ...ixs.value.setup,
          ixs.value.swap,
          ...(ixs.value.cleanup ? [ixs.value.cleanup] : []),
        ],
      }).compileToV0Message(alts.value),
    );
    tx.sign([owner]);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) {
      console.log((sim.value.logs ?? []).slice(-10).join("\n"));
      throw new Error(`swap $${usd} into the Nasdaq 100: the simulation failed (${JSON.stringify(sim.value.err)}). Nothing was sent.`);
    }
    console.log(`swap $${usd} into the Nasdaq 100: simulation ok, about ${quoteUnits(q.value.outAmount)} QQQx`);
    if (has("dry-run")) return BigInt(q.value.otherAmountThreshold);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
    const done = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (done.value.err) throw new Error(`the swap landed but failed: ${sig}`);
    const after = BigInt((await conn.getTokenAccountBalance(account, "confirmed")).value.amount);
    console.log(`swapped: ${sig} (+${quoteUnits(after - before)} QQQx)`);
    return after - before;
  };

  const thePlan = () => {
    if (!deployed.plan) throw new Error("No Plan yet: run `plan-open` first.");
    return { address: new PublicKey(deployed.plan.address), escrow: new PublicKey(deployed.plan.escrow) };
  };
  const launchOf = () => {
    const launch = deployed.launches.find((l) => l.pool === flag("pool"));
    if (!launch) throw new Error("--pool must be a launch recorded in deployed.json.");
    return launch;
  };

  switch (cmd) {
    case "plan": {
      const rent = async (bytes: number) => (await conn.getMinimumBalanceForRentExemption(bytes)) / 1e9;
      console.log("Scrip Curve, priced in the Nasdaq 100, step by step (rent read from the cluster now):");
      console.log(`  1. plan-open    Scrip's Plan on the Nasdaq 100, every launch fee's destination. About ${(await rent(300)).toFixed(4)} SOL with its escrow.`);
      console.log("  2. plan-invite  savers to match; each accepts in the app (a new saver's start accepts by itself).");
      console.log(`  3. config       the preset, priced in QQQx (Meteora's token badge passed), fee claimer ${deployed.feeClaimer}. About ${(await rent(1100)).toFixed(4)} SOL.`);
      console.log(`  4. launch       a demonstration token (graduates at ${THRESHOLD_QUOTE.demonstration} QQQx), optionally with a first buy. About 0.03 SOL.`);
      console.log(`  5. buy          after the fee has fallen from ${PRESET.startingFeeBps / 100}% to ${PRESET.endingFeeBps / 100}% (an hour), fill the curve.`);
      console.log("  6. migrate      DAMM v2, launch token / Nasdaq 100, all liquidity locked. About 0.05 SOL.");
      console.log("  7. fees         every fee waiting goes into the Plan's escrow; Scrip's saving service also does this by itself.");
      return;
    }
    case "plan-open": {
      if (deployed.plan) throw new Error(`A Plan already exists: ${deployed.plan.address}.`);
      const sponsor = loadKeypair();
      const planId = newReleaseId();
      const terms = {
        matchBps: Math.round(Number(flag("match") ?? "50") * 100),
        monthlyCapUsdc: BigInt(Math.round(Number(flag("cap") ?? "5") * 1e6)),
        defaultRateBps: Math.round(Number(flag("rate") ?? "10") * 100),
        escalateBps: 0,
      };
      const name = flag("name") ?? "Scrip Curve: launch fees matching savers";
      const open = openPlanIx({ sponsor: sponsor.publicKey, planId, asset: CURVE_QUOTE, terms, reason: name });
      if (!open.ok) throw new Error(open.why);
      const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), memoIx(sponsor.publicKey, name), open.value);
      const sig = await send(tx, sponsor, [], `open the Plan "${name}"`);
      const address = planPda(sponsor.publicKey, planId).toBase58();
      const escrow = planEscrow(sponsor.publicKey, planId, CURVE_QUOTE).toBase58();
      console.log(`plan ${address}, escrow ${escrow}`);
      if (sig !== "dry-run") {
        deployed.plan = { address, sponsor: sponsor.publicKey.toBase58(), planId: Buffer.from(planId).toString("hex"), escrow, createdSig: sig };
        save();
      }
      return;
    }
    case "plan-invite": {
      const sponsor = loadKeypair();
      const plan = thePlan().address;
      const members = (flag("members") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (members.length === 0 || members.length > 10) throw new Error("--members A,B,… (one to ten addresses)");
      const tx = new Transaction();
      for (const m of members) {
        const ix = addMemberIx({ sponsor: sponsor.publicKey, plan, owner: new PublicKey(m) });
        if (!ix.ok) throw new Error(ix.why);
        tx.add(ix.value);
      }
      await send(tx, sponsor, [], `invite ${members.length} saver${members.length === 1 ? "" : "s"}`);
      return;
    }
    case "config": {
      const kind = (flag("kind") ?? "demonstration") as "public" | "demonstration";
      if (deployed.configs[kind]) throw new Error(`A ${kind} config already exists: ${deployed.configs[kind]!.address}.`);
      if (!deployed.feeClaimer) throw new Error("deployed.json names no fee claimer.");
      const payer = loadKeypair();
      const config = Keypair.generate();
      const tx = await dbc.partner.createConfig({
        config: config.publicKey,
        feeClaimer: new PublicKey(deployed.feeClaimer),
        leftoverReceiver: payer.publicKey,
        quoteMint: CURVE_QUOTE_MINT,
        payer: payer.publicKey,
        tokenBadge: tokenBadge(DBC_PROGRAM_ID, CURVE_QUOTE_MINT),
        ...scripCurveConfig(kind),
      });
      const sig = await send(tx, payer, [config], `create the ${kind} config, priced in the Nasdaq 100`);
      console.log(`config ${config.publicKey.toBase58()}`);
      if (sig !== "dry-run") {
        deployed.configs[kind] = { address: config.publicKey.toBase58(), createdSig: sig };
        save();
      }
      return;
    }
    case "launch": {
      const kind = (flag("kind") ?? "demonstration") as "public" | "demonstration";
      const config = deployed.configs[kind];
      if (!config) throw new Error(`No ${kind} config yet: run \`config --kind ${kind}\` first.`);
      const name = flag("name");
      const symbol = flag("symbol");
      const uri = flag("uri");
      if (!name || !symbol || !uri) throw new Error("--name, --symbol and --uri are required.");
      if (/scrip/i.test(name) || /scrip/i.test(symbol)) throw new Error("A launch is never called a Scrip token: choose a name and symbol without 'Scrip'.");
      const payer = loadKeypair();
      let firstBuy = 0n;
      if (flag("first-buy-quote")) firstBuy = BigInt(Math.round(Number(flag("first-buy-quote")) * 10 ** CURVE_QUOTE.decimals));
      else if (Number(flag("first-buy-usd") ?? "0") > 0) firstBuy = await usdcToQuote(payer, Number(flag("first-buy-usd")));
      const baseMint = Keypair.generate();
      const tx = await dbc.creator.createPoolWithFirstBuy({
        // Meteora checks the quote's token badge when the pool is created, not only the config.
        createPoolParam: { name, symbol, uri, payer: payer.publicKey, poolCreator: payer.publicKey, config: new PublicKey(config.address), baseMint: baseMint.publicKey, tokenBadge: tokenBadge(DBC_PROGRAM_ID, CURVE_QUOTE_MINT) },
        firstBuyParam: firstBuy > 0n ? { buyer: payer.publicKey, buyAmount: new BN(firstBuy.toString()), minimumAmountOut: new BN(0), referralTokenAccount: null } : undefined,
      });
      const sig = await send(tx, payer, [baseMint], `launch ${name}${firstBuy > 0n ? ` with a first buy of ${quoteUnits(firstBuy)} QQQx` : ""}`);
      const pool = deriveDbcPoolAddress(CURVE_QUOTE_MINT, baseMint.publicKey, new PublicKey(config.address)).toBase58();
      console.log(`pool ${pool}, mint ${baseMint.publicKey.toBase58()}`);
      if (sig !== "dry-run") {
        deployed.launches.push({ name, symbol, kind, config: config.address, baseMint: baseMint.publicKey.toBase58(), pool, createdSig: sig, createdUnix: Math.floor(Date.now() / 1000) });
        save();
      }
      return;
    }
    case "buy": {
      // A plain buy on a launch recorded here: the founder's own, and said so wherever it is shown.
      // The fee falls from 25% to 1% over the first hour, so a buy that only fills the curve waits.
      const launch = launchOf();
      const payer = loadKeypair();
      let amount = 0n;
      if (flag("quote")) amount = BigInt(Math.round(Number(flag("quote")) * 10 ** CURVE_QUOTE.decimals));
      else if (Number(flag("usd") ?? "0") > 0) amount = await usdcToQuote(payer, Number(flag("usd")));
      if (amount <= 0n) throw new Error("--usd <USDC to spend> or --quote <Nasdaq 100 to spend> is required.");
      // Partial fill: a buy larger than the curve's remaining room fills it to graduation and
      // returns the rest, where an exact-in buy would be refused outright (InsufficientLiquidity).
      const tx = await dbc.pool.swap2({
        owner: payer.publicKey,
        pool: new PublicKey(launch.pool),
        amountIn: new BN(amount.toString()),
        minimumAmountOut: new BN(0),
        swapBaseForQuote: false,
        swapMode: SwapMode.PartialFill,
        referralTokenAccount: null,
      });
      await send(tx, payer, [], `buy ${launch.symbol} with up to ${quoteUnits(amount)} QQQx`);
      return;
    }
    case "migrate": {
      const launch = launchOf();
      const payer = loadKeypair();
      const out = await dbc.migration.migrateToDammV2({ payer: payer.publicKey, pool: new PublicKey(launch.pool), dammConfig: DAMM_V2_CUSTOMIZABLE_CONFIG });
      const sig = await send(out.transaction, payer, [out.firstPositionNftKeypair, out.secondPositionNftKeypair], `graduate ${launch.name}`);
      const dammPool = deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_CONFIG, new PublicKey(launch.baseMint), CURVE_QUOTE_MINT);
      // DBC hands the partner's position NFT to the config's fee claimer. Rather than trust the
      // ordering, read which NFT the claimer now holds.
      let partnerNft = out.secondPositionNftKeypair.publicKey;
      if (sig !== "dry-run") {
        for (const kp of [out.firstPositionNftKeypair, out.secondPositionNftKeypair]) {
          const acc = await conn.getParsedAccountInfo(derivePositionNftAccount(kp.publicKey), "confirmed");
          const owner = (acc.value?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed?.info?.owner;
          if (owner === deployed.feeClaimer) partnerNft = kp.publicKey;
        }
        Object.assign(launch, {
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
      const plan = thePlan();
      const launches = flag("pool") ? [launchOf()] : deployed.launches;
      for (const launch of launches) {
        const waiting = await claims.feesWaiting(conn, launch);
        if (!waiting.ok) {
          console.log(`${launch.symbol}: ${waiting.why}`);
          continue;
        }
        console.log(`${launch.symbol}: ${quoteUnits(waiting.value.onCurve)} QQQx on the curve, ${quoteUnits(waiting.value.onPosition)} on the graduated position`);
        if (waiting.value.onCurve > 0n) {
          const tx = await claims.curveFeeToPlan(conn, { launch, claimer: claimer.publicKey, plan: plan.address, amount: waiting.value.onCurve });
          if (!tx.ok) throw new Error(tx.why);
          await send(tx.value, claimer, [], `${launch.symbol}: the curve's fee, straight into the Plan`);
        }
        if (waiting.value.graduationFeeWaiting) {
          const quoteAccount = claims.claimerQuoteAccount(claimer.publicKey);
          const before = BigInt((await conn.getTokenAccountBalance(quoteAccount).catch(() => null))?.value.amount ?? "0");
          const tx = await claims.migrationFeeWithdraw(conn, { launch, claimer: claimer.publicKey });
          if (!tx.ok) throw new Error(tx.why);
          const sig = await send(tx.value, claimer, [], `${launch.symbol}: the partner's graduation fee`);
          if (sig !== "dry-run") {
            const after = BigInt((await conn.getTokenAccountBalance(quoteAccount, "confirmed")).value.amount);
            if (after > before) {
              const fwd = new Transaction().add(claims.forwardToPlan({ claimer: claimer.publicKey, escrow: plan.escrow, amount: after - before }));
              const fsig = await send(fwd, claimer, [], `${launch.symbol}: ${quoteUnits(after - before)} QQQx of graduation fee into the Plan`);
              if (fsig !== "dry-run") {
                Object.assign(launch, { migrationFeeSig: fsig });
                save();
              }
            }
          }
        }
        if (waiting.value.onPosition > 0n) {
          const tx = await claims.positionFeeToPlan(conn, { launch, claimer: claimer.publicKey, plan: plan.address });
          if (!tx.ok) throw new Error(tx.why);
          await send(tx.value, claimer, [], `${launch.symbol}: the graduated pool's fee, straight into the Plan`);
        }
      }
      // Raw units, the same the program counts; the wallet's display multiplies by the issuer's multiplier.
      const bal = await conn.getTokenAccountBalance(plan.escrow).catch(() => null);
      console.log(`the Plan's escrow now holds ${bal ? quoteUnits(bal.value.amount) : "unknown"} QQQx`);
      return;
    }
    case "status": {
      console.log(`quote: ${deployed.quoteMint} (QQQx); fee claimer: ${deployed.feeClaimer ?? "none"}`);
      if (deployed.plan) {
        const bal = await conn.getTokenAccountBalance(new PublicKey(deployed.plan.escrow)).catch(() => null);
        console.log(`plan ${deployed.plan.address}: escrow ${deployed.plan.escrow} holds ${bal ? quoteUnits(bal.value.amount) : "unknown"} QQQx`);
      } else console.log("plan: none yet");
      for (const [k, c] of Object.entries(deployed.configs)) console.log(`config ${k}: ${c.address}`);
      for (const l of deployed.launches) {
        const s = (await dbc.state.getPool(l.pool).catch(() => null))?.poolState;
        console.log(`launch ${l.name} (${l.symbol}): ${l.pool}`);
        if (s) console.log(`  quote reserve ${quoteUnits(s.quoteReserve.toString())} QQQx of ${THRESHOLD_QUOTE[l.kind]}, partner fee waiting ${quoteUnits(s.partnerQuoteFee.toString())}, migrated ${s.isMigrated ? "yes" : "no"}`);
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
