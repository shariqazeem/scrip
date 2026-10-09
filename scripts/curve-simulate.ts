/**
 * SCRIP CURVE, SIMULATED ON MAINNET WITHOUT A KEY — the steps that can run against today's chain
 * before anything exists: creating the launch config priced in the Nasdaq 100 (Meteora's token
 * badge passed) and opening Scrip's Plan. Any funded address stands in as the payer; nothing is
 * signed, so nothing can be sent.
 *
 *   npx tsx --conditions=react-server scripts/curve-simulate.ts --payer <funded address> [--sponsor <funded address>]
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

  const name = "Scrip Curve: launch fees matching savers";
  const open = openPlanIx({ sponsor, planId: newReleaseId(), asset: CURVE_QUOTE, terms: { matchBps: 5_000, monthlyCapUsdc: 5_000_000n, defaultRateBps: 1_000, escalateBps: 0 }, reason: name });
  if (!open.ok) throw new Error(open.why);
  await simulate(`open Scrip's Plan as ${sponsor.toBase58().slice(0, 6)}…`, sponsor, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), memoIx(sponsor, name), open.value]);
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});
