/**
 * SCRIP CURVE, FROM THE FOUNDER'S MACHINE — the vault, the preset config, a demonstration
 * launch, its graduation, and the claims that move its fees into savings.
 *
 *   npx tsx --conditions=react-server scripts/curve.ts <command> [flags]
 *
 *   plan                                          what each step does and roughly costs; no key
 *   vault   --keypair K --pool P --scrip S        the fee-sharing vault for USDC: P 90, S 10
 *   config  --keypair K --kind demonstration|public   a launch config whose fee claimer is the vault
 *   launch  --keypair K --kind demonstration --name N --symbol X --uri U [--first-buy 30]
 *   migrate --keypair K --pool POOL               graduate a completed curve to DAMM v2
 *   claim   --keypair K --pool POOL               pull the partner fees into the vault (K is a recipient)
 *   collect --keypair K                           the recipient K takes its share out of the vault
 *   pay     --keypair POOL --to WALLET --usd 1 --launch POOL --claim SIG
 *                                                 the Savings Pool pays a saver in S&P 500, the
 *                                                 receipt naming the launch and the claim it came from
 *   status                                        the vault, the configs and every launch, read live
 *
 * Every command that writes builds the transaction with Meteora's own SDKs, simulates it, and
 * only then signs and sends; `--dry-run` stops after the simulation. A keypair is read from
 * the file the founder names and never printed; only public keys and signatures are, and only
 * those are written back to `src/lib/curve/deployed.json`.
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
  const { Connection, Keypair, PublicKey, ComputeBudgetProgram } = web3;
  const BN = (await import("bn.js")).default;
  const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const { DynamicBondingCurveClient, deriveDbcPoolAddress, derivePositionAddress, derivePositionNftAccount, deriveDammV2PoolAddress } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const { DynamicFeeSharingClient } = await import("@meteora-ag/dynamic-fee-sharing-sdk");
  const { DAMM_V2_CUSTOMIZABLE_CONFIG, THRESHOLD_USDC, VAULT_SHARES, feeVaultAddress, scripCurveConfig } = await import("@/lib/curve/preset");

  const rpc = process.env.SOLANA_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const dbc = DynamicBondingCurveClient.create(conn, "confirmed");
  const dfs = new DynamicFeeSharingClient(conn, "confirmed");
  type Mutable<T> = { -readonly [K in keyof T]: T[K] };
  const deployed = JSON.parse(readFileSync(DEPLOYED_PATH, "utf8")) as Mutable<import("@/lib/curve/deployed").Deployed> & {
    configs: Record<string, { address: string; createdSig: string }>;
    launches: Array<Mutable<import("@/lib/curve/deployed").Launch>>;
  };
  const save = () => writeFileSync(DEPLOYED_PATH, `${JSON.stringify(deployed, null, 2)}\n`);

  const loadKeypair = (): InstanceType<typeof Keypair> => {
    const path = flag("keypair");
    if (!path) throw new Error("--keypair <path to a keypair file> is required for this command");
    const secret = Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? "~"), "utf8")) as number[]);
    const kp = Keypair.fromSecretKey(secret);
    console.log(`signing as ${kp.publicKey.toBase58()}`);
    return kp;
  };

  /** Simulate, then sign and send, then wait for it: one place every write goes through. */
  const send = async (tx: InstanceType<typeof web3.Transaction>, payer: InstanceType<typeof Keypair>, extra: Array<InstanceType<typeof Keypair>>, what: string) => {
    if (!tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId))) {
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
    }
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...extra);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) {
      console.log((sim.value.logs ?? []).slice(-12).join("\n"));
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

  const vaultKey = () => {
    if (!deployed.vault) throw new Error("No vault yet: run `vault` first.");
    return new PublicKey(deployed.vault.address);
  };

  switch (cmd) {
    case "plan": {
      const rent = async (bytes: number) => (await conn.getMinimumBalanceForRentExemption(bytes)) / 1e9;
      console.log(`Scrip Curve, step by step (rent read from ${rpc.includes("mainnet") ? "mainnet" : "the cluster"} now):`);
      console.log(`  1. vault    a fee-sharing vault for USDC, Savings Pool ${VAULT_SHARES.savingsPool / 100}% and Scrip ${VAULT_SHARES.scrip / 100}%. About ${(await rent(600)).toFixed(4)} SOL of rent with its token account.`);
      console.log(`  2. config   the preset, with the vault as fee claimer. About ${(await rent(1100)).toFixed(4)} SOL of rent.`);
      console.log(`  3. launch   a demonstration token on the config (threshold ${THRESHOLD_USDC.demonstration} USDC), optionally with a first buy. Pool, mint, metadata: about 0.03 SOL.`);
      console.log(`  4. migrate  once the curve completes: DAMM v2, all liquidity locked, the partner position owned by the vault. About 0.05 SOL.`);
      console.log(`  5. claim    pull the partner fees into the vault; collect: each recipient takes its share.`);
      console.log(`The public preset migrates on its own at ${THRESHOLD_USDC.public} USDC through Meteora's keepers.`);
      return;
    }
    case "vault": {
      if (deployed.vault) throw new Error(`A vault already exists: ${deployed.vault.address}. Its recipients cannot change; make a new one only on purpose.`);
      const payer = loadKeypair();
      const pool = new PublicKey(flag("pool") ?? "");
      const scrip = new PublicKey(flag("scrip") ?? "");
      const base = Keypair.generate();
      const mint = new PublicKey(USDC);
      const tx = await dfs.createFeeVaultPda({
        base: base.publicKey,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        owner: scrip,
        payer: payer.publicKey,
        userShare: [
          { address: pool, share: VAULT_SHARES.savingsPool },
          { address: scrip, share: VAULT_SHARES.scrip },
        ],
      });
      const sig = await send(tx, payer, [base], "create the fee-sharing vault");
      const address = feeVaultAddress(base.publicKey, mint).toBase58();
      console.log(`vault ${address}`);
      if (sig !== "dry-run") {
        deployed.vault = { address, base: base.publicKey.toBase58(), mint: USDC, savingsPool: pool.toBase58(), scrip: scrip.toBase58(), createdSig: sig };
        save();
      }
      return;
    }
    case "config": {
      const kind = (flag("kind") ?? "demonstration") as "public" | "demonstration";
      if (deployed.configs[kind]) throw new Error(`A ${kind} config already exists: ${deployed.configs[kind]!.address}.`);
      const payer = loadKeypair();
      const config = Keypair.generate();
      const tx = await dbc.partner.createConfig({
        config: config.publicKey,
        feeClaimer: vaultKey(),
        leftoverReceiver: new PublicKey(deployed.vault!.scrip),
        quoteMint: new PublicKey(USDC),
        payer: payer.publicKey,
        ...scripCurveConfig(kind),
      });
      const sig = await send(tx, payer, [config], `create the ${kind} config`);
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
      const baseMint = Keypair.generate();
      const firstBuy = Number(flag("first-buy") ?? "0");
      const tx = await dbc.creator.createPoolWithFirstBuy({
        createPoolParam: { name, symbol, uri, payer: payer.publicKey, poolCreator: payer.publicKey, config: new PublicKey(config.address), baseMint: baseMint.publicKey },
        firstBuyParam:
          firstBuy > 0
            ? { buyer: payer.publicKey, buyAmount: new BN(Math.round(firstBuy * 1e6)), minimumAmountOut: new BN(0), referralTokenAccount: null }
            : undefined,
      });
      const sig = await send(tx, payer, [baseMint], `launch ${name}`);
      const pool = deriveDbcPoolAddress(new PublicKey(USDC), baseMint.publicKey, new PublicKey(config.address)).toBase58();
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
      const poolKey = flag("pool");
      const launch = deployed.launches.find((l) => l.pool === poolKey);
      if (!launch) throw new Error("--pool must be a launch recorded in deployed.json.");
      const usd = Number(flag("usd") ?? "0");
      if (!(usd > 0)) throw new Error("--usd <USDC to spend> is required.");
      const payer = loadKeypair();
      const tx = await dbc.pool.swap({
        owner: payer.publicKey,
        pool: new PublicKey(launch.pool),
        amountIn: new BN(Math.round(usd * 1e6)),
        minimumAmountOut: new BN(0),
        swapBaseForQuote: false,
        referralTokenAccount: null,
      });
      await send(tx, payer, [], `buy ${usd} USDC of ${launch.symbol}`);
      return;
    }
    case "migrate": {
      const poolKey = flag("pool");
      const launch = deployed.launches.find((l) => l.pool === poolKey);
      if (!launch) throw new Error("--pool must be a launch recorded in deployed.json.");
      const payer = loadKeypair();
      const out = await dbc.migration.migrateToDammV2({ payer: payer.publicKey, pool: new PublicKey(launch.pool), dammConfig: DAMM_V2_CUSTOMIZABLE_CONFIG });
      const sig = await send(out.transaction, payer, [out.firstPositionNftKeypair, out.secondPositionNftKeypair], `graduate ${launch.name}`);
      const dammPool = deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_CONFIG, new PublicKey(launch.baseMint), new PublicKey(USDC));
      // DBC gives the first position to the larger side and hands the partner's NFT to the
      // config's fee claimer. Rather than trust the ordering, read which NFT the vault now holds.
      let partnerNft = out.secondPositionNftKeypair.publicKey;
      if (sig !== "dry-run") {
        for (const kp of [out.firstPositionNftKeypair, out.secondPositionNftKeypair]) {
          const acc = await conn.getParsedAccountInfo(derivePositionNftAccount(kp.publicKey), "confirmed");
          const owner = (acc.value?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed?.info?.owner;
          if (owner === vaultKey().toBase58()) partnerNft = kp.publicKey;
        }
      }
      if (sig !== "dry-run") {
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
    case "claim": {
      const signer = loadKeypair();
      const launch = deployed.launches.find((l) => l.pool === flag("pool"));
      if (!launch) throw new Error("--pool must be a launch recorded in deployed.json.");
      const feeVault = vaultKey();
      const pool = await dbc.state.getPool(launch.pool);
      if (!pool) throw new Error("The pool could not be read.");
      // The account wraps its fields in `poolState` (DBC 0.2).
      const state = pool.poolState;
      const quoteFee = BigInt(state.partnerQuoteFee.toString());
      console.log(`partner quote fee waiting on the curve: ${Number(quoteFee) / 1e6} USDC`);
      if (quoteFee > 0n) {
        const tx = await dfs.fundByClaimDbcPartnerTradingFee({ signer: signer.publicKey, feeClaimer: feeVault, feeVault, poolConfig: new PublicKey(launch.config), virtualPool: new PublicKey(launch.pool) });
        await send(tx, signer, [], "claim the partner trading fee into the vault");
      }
      if (state.isMigrated) {
        try {
          const tx = await dfs.fundByWithdrawDbcMigrationFee({ signer: signer.publicKey, isPartner: true, feeVault, poolConfig: new PublicKey(launch.config), virtualPool: new PublicKey(launch.pool) });
          await send(tx, signer, [], "withdraw the partner migration fee into the vault");
        } catch (err) {
          console.log(`migration fee: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (launch.dammPool && launch.partnerPosition && launch.partnerPositionNftAccount) {
          const tx = await dfs.fundByClaimDammV2Fee({ signer: signer.publicKey, owner: feeVault, feeVault, dammV2Position: new PublicKey(launch.partnerPosition), dammV2PositionNftAccount: new PublicKey(launch.partnerPositionNftAccount), dammV2Pool: new PublicKey(launch.dammPool) });
          await send(tx, signer, [], "claim the locked partner position's fees into the vault");
        }
      }
      return;
    }
    case "collect": {
      const user = loadKeypair();
      const tx = await dfs.claimUserFee({ feeVault: vaultKey(), user: user.publicKey, payer: user.publicKey });
      await send(tx, user, [], "take this recipient's share out of the vault");
      const ata = getAssociatedTokenAddressSync(new PublicKey(USDC), user.publicKey);
      const bal = await conn.getTokenAccountBalance(ata).catch(() => null);
      console.log(`USDC now in ${user.publicKey.toBase58()}: ${bal?.value.uiAmountString ?? "unknown"}`);
      return;
    }
    case "pay": {
      // Fees, turned into a saver's stock: pay in stock from the Savings Pool, with the launch and
      // the claim transaction in the reason, so the receipt says where the money came from.
      const poolKp = loadKeypair();
      if (deployed.vault && poolKp.publicKey.toBase58() !== deployed.vault.savingsPool) throw new Error("--keypair must be the Savings Pool's own key.");
      const to = new PublicKey(flag("to") ?? "");
      const usdAmount = Number(flag("usd") ?? "1");
      const launch = deployed.launches.find((l) => l.pool === flag("launch"));
      const claim = flag("claim") ?? "";
      if (!launch || claim.length < 32) throw new Error("--launch <a recorded pool> and --claim <the claim transaction> are required: the receipt must name both.");
      const reason = `Welcome bonus from Scrip, paid by the fees of ${launch.name} (${launch.symbol}). Claim: ${claim}`.slice(0, 200);
      const { buildIntake } = await import("@/lib/intake/build");
      const { readBookOf } = await import("@/lib/book/read-book");
      const { defaultAsset } = await import("@/lib/assets/registry");
      const book = await readBookOf(conn as never, to);
      const mode = book.ok && book.value ? "pay" : "gift";
      const built = await buildIntake({ payer: poolKp.publicKey, recipient: to, asset: defaultAsset(), amountUsdc: BigInt(Math.round(usdAmount * 1e6)), reason, mode });
      if (!built.ok) throw new Error(built.why);
      const tx = web3.VersionedTransaction.deserialize(Buffer.from(built.value.transactionBase64, "base64"));
      tx.sign([poolKp]);
      if (has("dry-run")) {
        const sim = await conn.simulateTransaction(tx);
        console.log(`pay: simulation ${sim.value.err ? JSON.stringify(sim.value.err) : "ok"}`);
        return;
      }
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
      const done = await conn.confirmTransaction({ signature: sig, blockhash: built.value.blockhash, lastValidBlockHeight: built.value.lastValidBlockHeight }, "confirmed");
      if (done.value.err) throw new Error(`landed but failed: ${sig}`);
      console.log(`${mode === "pay" ? "paid" : "a gift waiting for a claim"}: ${sig}`);
      if (mode === "gift") console.log("The recipient has no savings record yet: send them the claim link from /app/org/pay's result, or ask them to switch on saving first.");
      return;
    }
    case "status": {
      console.log(`vault: ${deployed.vault?.address ?? "none yet"}`);
      if (deployed.vault) {
        const b = await dfs.getFeeBreakdown(vaultKey()).catch(() => null);
        if (b) {
          console.log(`  funded ${Number(b.totalFundedFee.toString()) / 1e6} USDC, claimed ${Number(b.totalClaimedFee.toString()) / 1e6}, waiting ${Number(b.totalUnclaimedFee.toString()) / 1e6}`);
          for (const u of b.userFees) console.log(`  ${u.address.toBase58()}: ${Number(u.totalFee.toString()) / 1e6} in all, ${Number(u.feeClaimed.toString()) / 1e6} taken`);
        }
      }
      for (const [k, c] of Object.entries(deployed.configs)) console.log(`config ${k}: ${c.address}`);
      for (const l of deployed.launches) {
        const s = (await dbc.state.getPool(l.pool).catch(() => null))?.poolState;
        console.log(`launch ${l.name} (${l.symbol}): ${l.pool}`);
        if (s) console.log(`  quote reserve ${Number(s.quoteReserve.toString()) / 1e6} USDC, partner fee waiting ${Number(s.partnerQuoteFee.toString()) / 1e6}, migrated ${s.isMigrated ? "yes" : "no"}`);
      }
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run with no command for the plan.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
