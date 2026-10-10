/**
 * A STOCK ACCOUNT FOR A LOCAL VALIDATOR — a real holder's Token-2022 account in that stock, read
 * from mainnet (the largest holder's, found with getTokenLargestAccounts), its owner and amount
 * rewritten, written as a `--account` file at the payer's own associated address. Only for
 * `scripts/curve-localnet.sh`; nothing here signs or sends.
 *
 *   npx tsx scripts/curve-localnet-account.ts <payer> <out.json> [units, default 1] [mint, default the Nasdaq 100]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
const QQQX = "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ";

async function main() {
  const payer = new PublicKey(process.argv[2]!);
  const out = process.argv[3]!;
  const units = Number(process.argv[4] ?? "1");
  const mint = new PublicKey(process.argv[5] ?? QQQX);
  const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC!, "confirmed");
  // Any real holder's account would do; the largest is one that certainly exists.
  const largest = await conn.getTokenLargestAccounts(mint, "confirmed");
  const template = largest.value[0]?.address;
  if (!template) throw new Error("no holder of that mint was found");
  const info = await conn.getAccountInfo(template, "confirmed");
  if (!info) throw new Error("the template account could not be read");
  const data = Buffer.from(info.data);
  if (!new PublicKey(data.subarray(0, 32)).equals(mint)) throw new Error("the template is not an account in that mint");
  payer.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(Math.round(units * 1e8)), 64);
  const address = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);
  writeFileSync(
    out,
    JSON.stringify({ pubkey: address.toBase58(), account: { lamports: info.lamports, data: [data.toString("base64"), "base64"], owner: TOKEN_2022_PROGRAM_ID.toBase58(), executable: false, rentEpoch: 0, space: data.length } }),
  );
  console.log(address.toBase58());
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "<rpc>") : e);
  process.exit(1);
});
