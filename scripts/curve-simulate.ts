/**
 * SCRIP CURVE, SIMULATED ON MAINNET WITHOUT A KEY — the steps that can run against today's chain
 * before anything exists: creating the launch config priced in the Nasdaq 100 (Meteora's token
 * badge passed) and opening Scrip's Plan. Any funded address stands in as the payer; nothing is
 * signed, so nothing can be sent.
 *
 *   npx tsx --conditions=react-server scripts/curve-simulate.ts --payer <funded address> [--sponsor <funded address>] [--swap-owner <a USDC holder>]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
  type Ix = import("@solana/web3.js").TransactionInstruction;
  const { CURVE_QUOTE, CURVE_QUOTE_MINT, DBC_PROGRAM_ID, scripCurveConfig, tokenBadge } = await import("@/lib/curve/preset");
  const { DEPLOYED } = await import("@/lib/curve/deployed");
  const { curveClient } = await import("@/lib/curve/claims");
  const { memoIx } = await import("@/lib/intake/instructions");
  const { openPlanIx } = await import("@/lib/plan/instructions");
  const { newReleaseId } = await import("@/lib/solana/program");
  const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC!.replace(/"/g, ""), "confirmed");
  const payer = new PublicKey(flag("payer") ?? "");
  const sponsor = new PublicKey(flag("sponsor") ?? payer.toBase58());

  const simulate = async (what: string, by: InstanceType<typeof PublicKey>, ixs: readonly Ix[]) => {
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: by, recentBlockhash: blockhash, instructions: [...ixs] }).compileToV0Message());
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    console.log(`${what}: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : "simulation ok"}, ${sim.value.unitsConsumed} units, ${tx.serialize().length} bytes`);
    if (sim.value.err) console.log((sim.value.logs ?? []).slice(-12).join("\n"));
  };

  for (const kind of ["demonstration", "public"] as const) {
    const tx = await curveClient(conn).partner.createConfig({
      config: Keypair.generate().publicKey,
      feeClaimer: new PublicKey(DEPLOYED.feeClaimer!),
      leftoverReceiver: payer,
      quoteMint: CURVE_QUOTE_MINT,
      payer,
      tokenBadge: tokenBadge(DBC_PROGRAM_ID, CURVE_QUOTE_MINT),
      ...scripCurveConfig(kind),
    });
    await simulate(`create the ${kind} config, priced in the Nasdaq 100`, payer, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...tx.instructions]);
  }

  // The first buy's swap: USDC into the Nasdaq 100 through Jupiter, built exactly as curve.ts
  // builds it, for any address that holds USDC (--swap-owner), simulated without a signature.
  const swapOwner = flag("swap-owner");
  if (swapOwner) {
    const jup = await import("@/lib/jupiter/client");
    const { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const owner = new PublicKey(swapOwner);
    const q = await jup.quote({ inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", outputMint: CURVE_QUOTE.mint, amount: 5_000_000n, slippageBps: 100, maxAccounts: 40 });
    if (!q.ok) throw new Error(q.why);
    const account = getAssociatedTokenAddressSync(CURVE_QUOTE_MINT, owner, true, TOKEN_2022_PROGRAM_ID);
    const ixs = await jup.swapInstructions({ quote: q.value, userPublicKey: owner, destinationTokenAccount: account });
    if (!ixs.ok) throw new Error(ixs.why);
    const alts = await jup.lookupTables(conn, ixs.value.lookupTableAddresses);
    if (!alts.ok) throw new Error(alts.why);
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          createAssociatedTokenAccountIdempotentInstruction(owner, account, owner, CURVE_QUOTE_MINT, TOKEN_2022_PROGRAM_ID),
          ...ixs.value.setup,
          ixs.value.swap,
          ...(ixs.value.cleanup ? [ixs.value.cleanup] : []),
        ],
      }).compileToV0Message(alts.value),
    );
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    console.log(`swap $5 of USDC into the Nasdaq 100 for ${owner.toBase58().slice(0, 6)}…: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : "simulation ok"}, about ${(Number(q.value.outAmount) / 1e8).toFixed(6)} QQQx, ${tx.serialize().length} bytes`);
    if (sim.value.err) console.log((sim.value.logs ?? []).slice(-10).join("\n"));
  }

  const name = "Scrip Curve: launch fees matching savers";
  const open = openPlanIx({ sponsor, planId: newReleaseId(), asset: CURVE_QUOTE, terms: { matchBps: 5_000, monthlyCapUsdc: 5_000_000n, defaultRateBps: 1_000, escalateBps: 0 }, reason: name });
  if (!open.ok) throw new Error(open.why);
  await simulate(`open Scrip's Plan as ${sponsor.toBase58().slice(0, 6)}…`, sponsor, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), memoIx(sponsor, name), open.value]);
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});
