/**
 * A NASDAQ 100 ACCOUNT FOR A LOCAL VALIDATOR — a real holder's Token-2022 account read from
 * mainnet, its owner and amount rewritten, written as a `--account` file at the payer's own
 * associated address. Only for `scripts/curve-localnet.sh`; nothing here signs or sends.
 *
 *   npx tsx scripts/curve-localnet-account.ts <payer> <out.json> [units, default 1]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
const QQQX = new PublicKey("Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ");
/** The founder's test wallet's Nasdaq 100 account: any real holder's would do. */
const TEMPLATE = new PublicKey("D63QowjkiUNCsVLuA6ob3iRRosb7ukbMbeqphFEMki13");

async function main() {
  const payer = new PublicKey(process.argv[2]!);
  const out = process.argv[3]!;
  const units = Number(process.argv[4] ?? "1");
  const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC!, "confirmed");
  const info = await conn.getAccountInfo(TEMPLATE, "confirmed");
  if (!info) throw new Error("the template account could not be read");
  const data = Buffer.from(info.data);
  if (!new PublicKey(data.subarray(0, 32)).equals(QQQX)) throw new Error("the template is not a Nasdaq 100 account");
  payer.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(Math.round(units * 1e8)), 64);
  const address = getAssociatedTokenAddressSync(QQQX, payer, false, TOKEN_2022_PROGRAM_ID);
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
