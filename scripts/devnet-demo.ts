/**
 * THE DEVNET DEMO — the whole moment, on the deployed devnet program, for a wallet you can
 * sign into and watch at /app and /book/<handle>.
 *
 * There is no USDC, no SPYx and no Jupiter on devnet, so a six-decimal mint stands in for
 * USDC, a Token-2022 mint with a scaled-UI multiplier stands in for SPYx, and a transfer from
 * the keeper's own stash stands in for the route. The PRICE is not stood in for: every sweep
 * is verified on chain against Pyth's real SOL/USD account, through the same min-out
 * arithmetic the mainnet build applies to SPYX/USD.
 *
 *     npx tsx scripts/devnet-demo.ts setup            mints, a book at @demo, the rule on at 10%
 *     npx tsx scripts/devnet-demo.ts land 200         $200 lands in the owner's USDC account
 *     npx tsx scripts/devnet-demo.ts sweep            the keeper sweeps it: begin, route, finish, receipt
 *     npx tsx scripts/devnet-demo.ts sign <nonce> <issuedAt>   a sign-in signature for the owner
 *     npx tsx scripts/devnet-demo.ts status
 *
 * State lives in anchor/.keys/demo.json (gitignored): the owner's key and the two mints.
 * The deployer key pays, keeps and mints.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";
import { getMintLen } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, type VersionedTransaction } from "@solana/web3.js";
import { DEVNET_FEEDS } from "../src/lib/assets/registry";
import { decodeBook } from "../src/lib/book/decode";
import { parsePriceAccount } from "../src/lib/pyth/price";
import { minOutRaw } from "../src/lib/rule/min-out";
import { assetAta, enableRuleIxs, openBookIx, usdcAta } from "../src/lib/rule/instructions";
import { computeSlice } from "../src/lib/rule/slice";
import { signInMessage } from "../src/lib/session/message";
import { SCRIP_PROGRAM_ID, bookPda, newReleaseId, receiptPda } from "../src/lib/solana/program";
import { buildSweepTransaction } from "../src/lib/sweep/build";
import { confirmSignature, sendAndConfirm } from "@/lib/solana/confirm";
import { makeConnection } from "@/lib/solana/make-connection";

loadEnvLocal();

const RPC = process.env.DEVNET_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const KEY_PATH = process.env.DEVNET_KEYPAIR || join(process.cwd(), "anchor", ".keys", "deployer.json");
/** Where this demo's keys and mints are remembered. A rehearsal points it elsewhere so it
 * cannot touch the state of a cluster that is actually live. */
const STATE_PATH = process.env.DEMO_STATE?.trim() || join(process.cwd(), "anchor", ".keys", "demo.json");
const SLUG = process.env.DEMO_SLUG || "demo";
const RATE_BPS = Number(process.env.DEMO_RATE_BPS || "1000");
/** Who the handle names: a person, or an organisation that also pays in stock from this wallet. */
const KIND: "person" | "org" = process.env.DEMO_KIND === "org" ? "org" : "person";
const SOL_USD = new PublicKey(DEVNET_FEEDS.raw.account);
/** The SPYx multiplier read on 2026-09-12, so the devnet asset rebases like the real one. */
const MULTIPLIER = 1.005714560286254;

const conn = makeConnection(RPC);

type State = { owner: number[]; usdcMint: string; assetMint: string; slug: string };

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]!.replace(/^"|"$/g, "");
  }
}
function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}
function readState(): State | null {
  return existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) : null;
}
function must(): { st: State; owner: Keypair; usdcMint: PublicKey; asset: { mint: string; program: "token-2022"; decimals: number }; usdc: PublicKey } {
  const st = readState();
  if (!st) throw new Error("no demo yet: run `setup` first");
  const owner = Keypair.fromSecretKey(Uint8Array.from(st.owner));
  const usdcMint = new PublicKey(st.usdcMint);
  return { st, owner, usdcMint, asset: { mint: st.assetMint, program: "token-2022", decimals: 8 }, usdc: usdcAta(owner.publicKey, usdcMint) };
}

async function withFreshBlockhash<T>(attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 4; i += 1) {
    try {
      return await attempt();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/Blockhash not found|block height exceeded/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}
async function send(tx: Transaction, signers: Keypair[]): Promise<string> {
  return withFreshBlockhash(async () => {
    const fresh = new Transaction().add(...tx.instructions);
    fresh.feePayer = signers[0]!.publicKey;
    return sendAndConfirm(conn, fresh, signers);
  });
}
async function sendV0(build: () => Promise<VersionedTransaction>, signers: Keypair[]): Promise<string> {
  return withFreshBlockhash(async () => {
    const tx = await build();
    tx.sign(signers);
    const sig = await conn.sendTransaction(tx, { skipPreflight: false });
    const latest = await conn.getLatestBlockhash("confirmed");
    const done = await confirmSignature(conn, sig, latest.lastValidBlockHeight);
    if (!done.ok) throw new Error(done.why);
    return sig;
  });
}
async function balance(ata: PublicKey, program: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, ata, "confirmed", program)).amount;
  } catch {
    return 0n;
  }
}
async function readBook(o: PublicKey) {
  const info = await conn.getAccountInfo(bookPda(o), "confirmed");
  if (!info) throw new Error("no book");
  const b = decodeBook(info.data);
  if (!b.ok) throw new Error(b.why);
  return b.value;
}
async function readPyth(account: PublicKey) {
  const info = await conn.getAccountInfo(account, "confirmed");
  if (!info) throw new Error("no price account");
  const p = parsePriceAccount(info.data);
  if (!p.ok) throw new Error(p.why);
  return p.value;
}

// ── setup ──────────────────────────────────────────────────────────────────────────────
async function setup() {
  const payer = loadKeypair(KEY_PATH);
  if (readState()) {
    console.log(`demo already set up at ${STATE_PATH}; delete it to start over`);
    return;
  }
  const program = await conn.getAccountInfo(SCRIP_PROGRAM_ID);
  if (!program?.executable) throw new Error(`${SCRIP_PROGRAM_ID.toBase58()} is not deployed on ${RPC}`);

  const owner = Keypair.generate();
  const usdcMint = Keypair.generate();
  const assetMint = Keypair.generate();
  const asset = { mint: assetMint.publicKey.toBase58(), program: "token-2022" as const, decimals: 8 };
  console.log(`owner   ${owner.publicKey.toBase58()}`);
  console.log(`usdc    ${usdcMint.publicKey.toBase58()} (six-decimal stand-in)`);
  console.log(`asset   ${assetMint.publicKey.toBase58()} (Token-2022, scaled UI ×${MULTIPLIER})`);

  const plainLen = getMintLen([]);
  const scaledLen = getMintLen([ExtensionType.ScaledUiAmountConfig]);
  const [plainRent, scaledRent] = await Promise.all([conn.getMinimumBalanceForRentExemption(plainLen), conn.getMinimumBalanceForRentExemption(scaledLen)]);
  console.log("1/3 the two mints, and the owner's SOL…");
  await send(
    new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdcMint.publicKey, space: plainLen, lamports: plainRent, programId: TOKEN_PROGRAM_ID }),
      createInitializeMintInstruction(usdcMint.publicKey, 6, payer.publicKey, null, TOKEN_PROGRAM_ID),
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: assetMint.publicKey, space: scaledLen, lamports: scaledRent, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeScaledUiAmountConfigInstruction(assetMint.publicKey, payer.publicKey, MULTIPLIER, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(assetMint.publicKey, 8, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: owner.publicKey, lamports: 0.09 * LAMPORTS_PER_SOL }),
    ),
    [payer, usdcMint, assetMint],
  );
  console.log("2/3 the owner's USDC ($1,000 already there), the keeper's accounts…");
  await send(
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), owner.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
      createMintToInstruction(usdcMint.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), payer.publicKey, 1_000_000_000n, [], TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(payer.publicKey, usdcMint.publicKey), payer.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, assetMint.publicKey, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(assetMint.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, 100_000_000_000n, [], TOKEN_2022_PROGRAM_ID),
    ),
    [payer],
  );
  writeFileSync(STATE_PATH, JSON.stringify({ owner: [...owner.secretKey], usdcMint: usdcMint.publicKey.toBase58(), assetMint: asset.mint, slug: SLUG } satisfies State, null, 2));

  console.log(`3/3 the ${KIND === "org" ? "organisation" : "register"} at @${SLUG}, and the rule on at ${RATE_BPS / 100}%: open, approve, float, enable in ONE transaction…`);
  const open = openBookIx({ owner: owner.publicKey, slug: SLUG, asset, usdcMint: usdcMint.publicKey, termsVersion: 0, kind: KIND });
  const on = enableRuleIxs({
    owner: owner.publicKey,
    usdcMint: usdcMint.publicKey,
    terms: { rateBps: RATE_BPS, escalateBps: 0, floorUsdc: 0n, capUsdc: 0n, toleranceBps: 100 },
    allowanceUsdc: 1_000_000_000n,
    floatLamports: BigInt(0.05 * LAMPORTS_PER_SOL),
  });
  if (!open.ok) throw new Error(open.why);
  if (!on.ok) throw new Error(on.why);
  const sig = await send(new Transaction().add(open.value, ...on.value), [owner]);
  console.log(`on. ${sig}`);
  await status();
}

// ── land ───────────────────────────────────────────────────────────────────────────────
async function land(amountUsd: number) {
  const payer = loadKeypair(KEY_PATH);
  const { owner, usdcMint, usdc } = must();
  const base = BigInt(Math.round(amountUsd * 1e6));
  const sig = await send(new Transaction().add(createMintToInstruction(usdcMint, usdc, payer.publicKey, base, [], TOKEN_PROGRAM_ID)), [payer]);
  console.log(`$${amountUsd.toFixed(2)} landed at ${owner.publicKey.toBase58()}: ${sig}`);
}

// ── sweep ──────────────────────────────────────────────────────────────────────────────
async function sweep() {
  const payer = loadKeypair(KEY_PATH);
  const { owner, usdcMint, asset, usdc } = must();
  const book = await readBook(owner.publicKey);
  const bal = await balance(usdc, TOKEN_PROGRAM_ID);
  const slice = computeSlice({ balance: bal, watermark: book.rule.watermark, minInbound: book.rule.minInbound, cap: book.rule.capUsdc, floor: book.rule.floorUsdc, rateBps: book.rule.rateBps });
  if (!slice.ok) throw new Error(slice.why);
  console.log(`balance $${Number(bal) / 1e6}, watermark $${Number(book.rule.watermark) / 1e6}: inbound $${Number(slice.value.inbound) / 1e6}, slice $${Number(slice.value.slice) / 1e6}`);

  const price = await readPyth(SOL_USD);
  const min = minOutRaw({ sliceUsdc: slice.value.slice, toleranceBps: book.rule.toleranceBps, price: price.price, conf: price.conf, expo: price.expo, assetDecimals: 8, multiplierE12: null });
  if (!min.ok) throw new Error(min.why);
  console.log(`Pyth SOL/USD ${Number(price.price) * 10 ** price.expo} (±${Number(price.conf) * 10 ** price.expo}), min out ${min.value} raw`);

  const releaseId = newReleaseId();
  const ownerAsset = assetAta(owner.publicKey, asset);
  const stash = assetAta(payer.publicKey, asset);
  const fill = min.value + min.value / 200n; // a fill half a percent better than the minimum
  const sig = await sendV0(async () => {
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const t = buildSweepTransaction({
      keeper: payer.publicKey,
      owner: owner.publicKey,
      usdcMint,
      asset,
      releaseId,
      priceUpdate: SOL_USD,
      route: [createTransferCheckedInstruction(stash, new PublicKey(asset.mint), ownerAsset, payer.publicKey, fill, 8, [], TOKEN_2022_PROGRAM_ID)],
      lookupTables: [],
      recentBlockhash: blockhash,
    });
    if (!t.ok) throw new Error(t.why);
    return t.value;
  }, [payer]);
  console.log(`swept. receipt ${receiptPda(bookPda(owner.publicKey), releaseId).toBase58()}`);
  console.log(`http://localhost:3000/receipt/${sig}`);
}

// ── sign ───────────────────────────────────────────────────────────────────────────────
function sign(nonce: string, issuedAt: string) {
  const { owner } = must();
  const msg = new TextEncoder().encode(signInMessage(owner.publicKey.toBase58(), nonce, issuedAt));
  const sig = ed25519.sign(msg, owner.secretKey.slice(0, 32));
  console.log(JSON.stringify({ pubkey: owner.publicKey.toBase58(), signature: Buffer.from(sig).toString("base64"), nonce, issuedAt }));
}

// ── status ─────────────────────────────────────────────────────────────────────────────
async function status() {
  const { st, owner, asset, usdc } = must();
  const payer = loadKeypair(KEY_PATH);
  const [book, bal, held, payerSol, ownerSol] = await Promise.all([readBook(owner.publicKey).catch(() => null), balance(usdc, TOKEN_PROGRAM_ID), balance(assetAta(owner.publicKey, asset), TOKEN_2022_PROGRAM_ID), conn.getBalance(payer.publicKey), conn.getBalance(owner.publicKey)]);
  console.log(`owner    ${owner.publicKey.toBase58()}  (${ownerSol / LAMPORTS_PER_SOL} SOL)`);
  console.log(`keeper   ${payer.publicKey.toBase58()}  (${payerSol / LAMPORTS_PER_SOL} SOL)`);
  console.log(`handle   @${st.slug}   /app after sign-in · /book/${st.slug} once published`);
  console.log(`usdc     $${Number(bal) / 1e6}   watermark $${book ? Number(book.rule.watermark) / 1e6 : "?"}   unswept $${book ? Number(bal - book.rule.watermark) / 1e6 : "?"}`);
  console.log(`asset    ${Number(held) / 1e8} raw units   rule ${book?.rule.enabled ? `on at ${book.rule.rateBps / 100}%` : "off"}   sweeps ${book?.rule.sweeps ?? 0}`);
}

const [cmd, a, b] = process.argv.slice(2);
(async () => {
  if (cmd === "setup") await setup();
  else if (cmd === "land") await land(Number(a || "200"));
  else if (cmd === "sweep") await sweep();
  else if (cmd === "sign") sign(a!, b!);
  else if (cmd === "status") await status();
  else {
    console.log("usage: devnet-demo.ts setup | land <usd> | sweep | sign <nonce> <issuedAt> | status");
    process.exit(2);
  }
})().catch((err) => {
  console.error(err instanceof Error ? `${err.message}${"logs" in err ? `\n${(err as { logs?: string[] }).logs?.join("\n")}` : ""}` : err);
  process.exit(1);
});
