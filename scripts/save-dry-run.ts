/**
 * A SAVE, BUILT AND SIMULATED, NEVER SIGNED — for any wallet, against mainnet.
 *
 *     npx tsx --conditions=react-server scripts/save-dry-run.ts <wallet> [SYMBOL] [dollars]
 *
 * Prints the quote, the cost, the transaction's size and instructions, and what the chain
 * said when asked. Nothing leaves this machine but reads; no key is loaded.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

async function main() {
  const [wallet, symbol = "NVDAx", dollars = "5"] = process.argv.slice(2);
  if (!wallet) throw new Error("usage: save-dry-run <wallet> [SYMBOL] [dollars]");
  const { PublicKey, VersionedTransaction } = await import("@solana/web3.js");
  const { catalogue } = await import("@/lib/save/catalogue");
  const { buildSave } = await import("@/lib/save/build");
  const { readInflows } = await import("@/lib/save/inflows");
  const { suggestSave } = await import("@/lib/save/amount");
  const { connection } = await import("@/lib/solana/connection");
  const stock = catalogue().find((s) => s.symbol === symbol);
  if (!stock) throw new Error(`${symbol} is not in the catalogue`);
  const owner = new PublicKey(wallet);

  const flows = await readInflows(wallet);
  if (flows.ok) {
    console.log(`USDC ${Number(flows.value.usdc) / 1e6}, SOL ${flows.value.lamports / 1e9}, payments in 30 days: ${flows.value.inflows.length}`);
    for (const f of flows.value.inflows.slice(0, 5)) console.log(`  ${new Date(f.at * 1000).toISOString()} $${Number(f.usdc) / 1e6} from ${f.from ?? "?"}`);
    const s = suggestSave(flows.value.inflows, flows.value.usdc, Math.floor(Date.now() / 1000));
    console.log(`first line: ${s ? `You received $${Number(s.inflow.usdc) / 1e6}. Save 10%: $${Number(s.saveUsdc) / 1e6}` : "the chips"}`);
  } else console.log(`inflows held: ${flows.why}`);

  const built = await buildSave({ owner, stock, usdc: BigInt(Math.round(Number(dollars) * 1e6)) });
  if (!built.ok) {
    console.log(`HELD: ${built.why}`);
    return;
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(built.value.transactionBase64, "base64"));
  console.log(`quote:`, built.value.quote);
  console.log(`cost:`, built.value.cost);
  console.log(`bytes: ${tx.serialize().length}; instructions: ${tx.message.compiledInstructions.length}`);
  const sim = await connection().simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  console.log(`simulation: ${sim.value.err ? JSON.stringify(sim.value.err) : "ok"}, units ${sim.value.unitsConsumed}`);
  for (const l of (sim.value.logs ?? []).filter((l) => /Memo|invoke \[1\]|failed|error/i.test(l))) console.log(`  ${l}`);
}

void main();
