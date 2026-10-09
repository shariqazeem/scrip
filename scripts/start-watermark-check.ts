/**
 * PROOF THAT A START COUNTS ITS FIRST PAYMENT — simulated on the cluster, never signed.
 *
 * Builds a start for any wallet with a first payment, simulates it with the Book and the USDC
 * account returned, and prints the balance after, the watermark `enable_rule` recorded, and the
 * slice the program would take: the arrival Scrip's servers will save seconds after a real start.
 *
 *   npx tsx --conditions=react-server scripts/start-watermark-check.ts --owner <address> --first 10.10 [--rate 1000]
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
  const { unpackAccount } = await import("@solana/spl-token");
  const { defaultAsset } = await import("@/lib/assets/registry");
  const { buildStart } = await import("@/lib/start/build");
  const { decodeBook } = await import("@/lib/book/decode");
  const { computeSlice } = await import("@/lib/rule/slice");
  const { bookPda } = await import("@/lib/solana/program");
  const { usdcAta } = await import("@/lib/rule/instructions");
  const { usdcMintFor } = await import("@/lib/book/read-book");
  const { connection } = await import("@/lib/solana/connection");
  const owner = new PublicKey(arg("owner") ?? "");
  const rateBps = Number(arg("rate") ?? "1000");
  const firstUsdc = BigInt(Math.round(Number(arg("first") ?? "10") * 1e6));
  const asset = defaultAsset();
  const built = await buildStart({ owner, asset, rateBps, firstUsdc, termsVersion: 1 });
  if (!built.ok) throw new Error(built.why);
  const conn = connection();
  const tx = VersionedTransaction.deserialize(Buffer.from(built.value.transactions[0]!, "base64"));
  const book = bookPda(owner);
  const ata = usdcAta(owner, usdcMintFor(null));
  const before = await conn.getTokenAccountBalance(ata, "confirmed");
  const sim = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [book.toBase58(), ata.toBase58()] },
  });
  if (sim.value.err) {
    console.log("FAILED", JSON.stringify(sim.value.err));
    console.log((sim.value.logs ?? []).slice(-10).join("\n"));
    return;
  }
  const [bookAcc, ataAcc] = sim.value.accounts ?? [];
  if (!bookAcc || !ataAcc) throw new Error("the simulation returned no accounts");
  const b = decodeBook(Buffer.from(bookAcc.data[0] ?? "", "base64"));
  if (!b.ok) throw new Error(b.why);
  const usdc = unpackAccount(ata, { data: Buffer.from(ataAcc.data[0] ?? "", "base64"), owner: new PublicKey(ataAcc.owner), lamports: ataAcc.lamports, executable: false }, new PublicKey(ataAcc.owner));
  const r = b.value.rule;
  const slice = computeSlice({ balance: usdc.amount, watermark: r.watermark, minInbound: r.minInbound, cap: r.capUsdc, floor: r.floorUsdc, rateBps: r.rateBps });
  console.log(`USDC before ${before.value.amount}, after ${usdc.amount} (unchanged: ${String(usdc.amount) === before.value.amount})`);
  console.log(`delegate ${usdc.delegate?.equals(book) ? "the Book" : usdc.delegate?.toBase58()} for ${usdc.delegatedAmount}`);
  console.log(`rule on ${r.enabled}, rate ${r.rateBps}, watermark ${r.watermark}, sweeps ${r.sweeps}`);
  console.log(`the program sees ${usdc.amount - r.watermark} arriving; it would save ${slice.ok ? slice.value.slice : slice.why}`);
  console.log(`${Buffer.from(built.value.transactions[0]!, "base64").length} bytes, ${sim.value.unitsConsumed} units`);
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});
