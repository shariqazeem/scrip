/**
 * THE ONE FLOW, BUILT AND SIMULATED FOR ANY WALLET — never signed, never sent. Shows how many
 * transactions a start takes, their sizes, and whether the chain would accept them.
 *
 *   npx tsx scripts/start-dry-run.ts --owner <address> [--rate 1000] [--save 5] [--mint <stock>]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { PublicKey, VersionedTransaction } = await import("@solana/web3.js");
  const { defaultAsset, assetByMint } = await import("@/lib/assets/registry");
  const { stockByMint } = await import("@/lib/save/catalogue");
  const { buildStart } = await import("@/lib/start/build");
  const { connection } = await import("@/lib/solana/connection");
  const owner = new PublicKey(arg("owner") ?? "");
  const asset = arg("mint") ? assetByMint(arg("mint")!) : defaultAsset();
  if (!asset) throw new Error("not a registry stock");
  const saveUsd = Number(arg("save") ?? "5");
  const t0 = Date.now();
  const built = await buildStart({
    owner,
    asset,
    stock: stockByMint(asset.mint) ?? null,
    rateBps: Number(arg("rate") ?? "1000"),
    saveUsdc: BigInt(Math.round(saveUsd * 1e6)),
    termsVersion: asset.issuer.name.includes("xStocks") ? 1 : 0,
  });
  if (!built.ok) {
    console.log("held:", built.why);
    return;
  }
  const b = built.value;
  console.log(`${b.transactions.length} transaction(s) in ${Date.now() - t0} ms; joins ${b.joins}; name @${b.slug}`);
  console.log(`cost: deposits ${b.cost.depositLamports}, prepaid ${b.cost.prepaidLamports}, fee ${b.cost.feeLamports} lamports`);
  if (b.quote) console.log(`first save: ${Number(b.quote.inUsdc) / 1e6} USDC → ${b.quote.outRaw} raw (${b.quote.route.join(" → ")})`);
  const conn = connection();
  for (const [i, raw] of b.transactions.entries()) {
    const tx = VersionedTransaction.deserialize(Buffer.from(raw, "base64"));
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    console.log(`#${i + 1}: ${Buffer.from(raw, "base64").length} bytes, ${tx.message.compiledInstructions.length} instructions, simulation ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : "ok"}, ${sim.value.unitsConsumed} units`);
    if (sim.value.err) console.log((sim.value.logs ?? []).slice(-8).join("\n"));
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});
