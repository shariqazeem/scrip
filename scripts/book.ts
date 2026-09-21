/**
 * A BOOK FROM A KEYPAIR, ON ANY CLUSTER — for the wallet on the front door, or any wallet
 * whose key you hold and would rather not import into a browser.
 *
 *     npx tsx scripts/book.ts start   --key anchor/.keys/front.json --slug scrip --rate 1000 [--kind org]
 *     npx tsx scripts/book.ts status  --key anchor/.keys/front.json
 *     npx tsx scripts/book.ts publish --slug scrip [--off]
 *
 * `start` is the same one-signature transaction the rule page signs: open the book, approve
 * the Book as delegate for the allowance, deposit the float, turn the rule on. On mainnet the
 * pay-in mint is USDC and the asset comes from the registry (SPYx by default); on devnet the
 * pay-in mint is NEXT_PUBLIC_DEVNET_USDC_MINT. The wallet needs SOL for the float and fees,
 * and a USDC account (receive any USDC once) before the rule can watch it.
 *
 * `publish` flips the off-chain flag that makes /book/<slug> public. The book row must be in
 * the cache first: open /ledger once, or POST /api/maintenance, after `start`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { USDC_MINT, assetBySymbol } from "../src/lib/assets/registry";
import { signInMessage } from "../src/lib/session/message";
import { decodeBook } from "../src/lib/book/decode";
import { enableRuleIxs, openBookIx, usdcAta } from "../src/lib/rule/instructions";
import { bookPda } from "../src/lib/solana/program";
import { sendAndConfirm } from "@/lib/solana/confirm";
import { makeConnection } from "@/lib/solana/make-connection";

loadEnvLocal();
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() || "devnet";
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || (CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
const conn = makeConnection(RPC);

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]!.replace(/^"|"$/g, "");
  }
}
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function keypair(): Keypair {
  const path = arg("key");
  if (!path) throw new Error("--key <path> is required");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}
function payInMint(): PublicKey {
  if (CLUSTER === "mainnet-beta") return new PublicKey(USDC_MINT);
  const m = process.env.NEXT_PUBLIC_DEVNET_USDC_MINT?.trim();
  if (!m) throw new Error("on devnet set NEXT_PUBLIC_DEVNET_USDC_MINT to the stand-in mint");
  return new PublicKey(m);
}

async function start() {
  const owner = keypair();
  const slug = arg("slug");
  if (!slug) throw new Error("--slug <handle> is required");
  const rateBps = Number(arg("rate", "1000"));
  const asset = assetBySymbol(arg("asset", "SPYx")!);
  if (!asset) throw new Error("unknown asset symbol");
  const allowance = BigInt(Math.round(Number(arg("allowance", "1000")) * 1e6));
  const floatLamports = BigInt(Math.round(Number(arg("float", "0.05")) * LAMPORTS_PER_SOL));
  const usdcMint = payInMint();
  const acct = await getAccount(conn, usdcAta(owner.publicKey, usdcMint), "confirmed", TOKEN_PROGRAM_ID).catch(() => null);
  if (!acct) throw new Error(`${owner.publicKey.toBase58()} has no USDC account yet on ${CLUSTER}; receive any USDC first`);
  const sol = await conn.getBalance(owner.publicKey);
  console.log(`${owner.publicKey.toBase58()} on ${CLUSTER}: ${sol / LAMPORTS_PER_SOL} SOL, $${Number(acct.amount) / 1e6} USDC (becomes the watermark)`);
  const kindArg = arg("kind", "person");
  if (kindArg !== "person" && kindArg !== "org") throw new Error("--kind is person or org");
  const open = openBookIx({ owner: owner.publicKey, slug, asset, usdcMint, termsVersion: asset.issuer.name.includes("xStocks") ? 1 : 0, kind: kindArg });
  const on = enableRuleIxs({ owner: owner.publicKey, usdcMint, terms: { rateBps, escalateBps: 0, floorUsdc: 0n, capUsdc: 0n, toleranceBps: 100 }, allowanceUsdc: allowance, floatLamports });
  if (!open.ok) throw new Error(open.why);
  if (!on.ok) throw new Error(on.why);
  const tx = new Transaction().add(open.value, ...on.value);
  tx.feePayer = owner.publicKey;
  const sig = await sendAndConfirm(conn, tx, [owner]);
  console.log(`@${slug}${kindArg === "org" ? " (an organisation)" : ""}: the rule is on at ${rateBps / 100}%, becomes ${asset.symbol}. ${sig}`);
}

async function status() {
  const owner = keypair();
  const info = await conn.getAccountInfo(bookPda(owner.publicKey), "confirmed");
  if (!info) {
    console.log(`${owner.publicKey.toBase58()} has no book on ${CLUSTER}`);
    return;
  }
  const b = decodeBook(info.data);
  if (!b.ok) throw new Error(b.why);
  console.log(`@${b.value.slug}: rule ${b.value.rule.enabled ? `on at ${b.value.rule.rateBps / 100}%` : "off"}, asset ${b.value.asset}, sweeps ${b.value.rule.sweeps}, watermark $${Number(b.value.rule.watermark) / 1e6}`);
}

function publish() {
  const slug = arg("slug");
  if (!slug) throw new Error("--slug <handle> is required");
  const path = process.env.SCRIP_DB_PATH?.trim() || join(process.cwd(), "var", `scrip.${CLUSTER}.db`);
  const db = new Database(path);
  const r = db.prepare("update books set published = ? where slug = ?").run(flag("off") ? 0 : 1, slug);
  if (r.changes === 0) throw new Error(`no cached book for @${slug} in ${path}; open /ledger once (or POST /api/maintenance) so the indexer sees it, then retry`);
  console.log(`@${slug}: public page ${flag("off") ? "off" : "on"}`);
}

/** A sign-in signature for the key: `book.ts sign --key <path> <nonce> <issuedAt>`. */
function sign() {
  const kp = keypair();
  const [nonce, issuedAt] = process.argv.slice(3).filter((a) => !a.startsWith("--") && a !== arg("key"));
  if (!nonce || !issuedAt) throw new Error("sign needs <nonce> <issuedAt> from GET /api/session/nonce");
  const msg = new TextEncoder().encode(signInMessage(kp.publicKey.toBase58(), nonce, issuedAt));
  const sig = ed25519.sign(msg, kp.secretKey.slice(0, 32));
  console.log(JSON.stringify({ pubkey: kp.publicKey.toBase58(), signature: Buffer.from(sig).toString("base64"), nonce, issuedAt }));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === "start") await start();
  else if (cmd === "sign") sign();
  else if (cmd === "status") await status();
  else if (cmd === "publish") publish();
  else {
    console.log("usage: book.ts start --key <path> --slug <handle> [--kind person|org] [--rate 1000] [--asset SPYx] [--allowance 1000] [--float 0.05] | status --key <path> | publish --slug <handle> [--off]");
    process.exit(2);
  }
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
