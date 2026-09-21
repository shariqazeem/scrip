/**
 * THE KEEPER — permissionless, open source, and paid a fixed tip per sweep.
 *
 *     npm run keeper
 *
 * It watches every Book with the rule on, and when the owner's USDC has risen above the
 * watermark by at least the minimum it submits ONE atomic transaction:
 *
 *     [compute, begin_sweep, jupiter…, finish_sweep]
 *
 * The program decides the amount, the price bound and the receipt. The keeper's only
 * discretion is the route, and its only reward is the tip. It cannot omit the check, cannot
 * redirect the output and cannot take more than the rule allows — every one of those is
 * refused on chain, and this process finds out by paying a fee.
 *
 * WHAT IT NEEDS: a keypair with SOL (fees, and rent it is repaid for), a Pyth API key (Hermes
 * has required one since 2026-08-26, and the on-chain SPYX/USD account is not kept fresh), and
 * an RPC. On devnet there is no Jupiter and no registered asset, so it only syncs watermarks
 * and reports; the devnet battery proves the sweep with a stand-in route.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { Wallet } from "@coral-xyz/anchor";
import { PythSolanaReceiver, TransactionBuilder } from "@pythnetwork/pyth-solana-receiver";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { type AccountInfo, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { type Asset, type PriceFeed, USDC_MINT, assetByMint } from "@/lib/assets/registry";
import { type Book, type Grant, decodeBook, decodeGrant, releasableRaw } from "@/lib/book/decode";
import { vestIx } from "@/lib/grant/instructions";
import { multiplierInForce } from "@/lib/corporate-actions/multiplier";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import type { KeeperBookReport, KeeperHealth } from "@/lib/keeper/health";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type HermesLatest, hermesKey, latest as hermesLatest } from "@/lib/pyth/hermes";
import { readPriceAccount } from "@/lib/pyth/read";
import { settleable } from "@/lib/pyth/price";
import { decimalToE12, minOutRaw } from "@/lib/rule/min-out";
import { assetAta, syncWatermarkIx, tokenProgramFor, usdcAta } from "@/lib/rule/instructions";
import { FEED_MAX_AGE_SECONDS, MAX_CONF_BPS, MIN_SLICE, computeSlice, effectiveRate } from "@/lib/rule/slice";
import { SCRIP_PROGRAM_ID, bookPda, discriminatorFilter, newReleaseId } from "@/lib/solana/program";
import { buildSweepTransaction } from "@/lib/sweep/build";
import { confirmSignature, sendAndConfirm } from "@/lib/solana/confirm";
import { makeConnection } from "@/lib/solana/make-connection";
import { rentFor } from "@/lib/solana/rent";

// ── configuration ─────────────────────────────────────────────────────────────────────────

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() || "devnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
  (CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
/**
 * How often to look when nothing has woken us. A websocket wakes the keeper the moment a
 * watched USDC account changes, so this is the floor, not the response time — and on
 * Solana's own endpoints it is slower on purpose, because that budget is per IP and the
 * site the judges open shares it.
 */
const POLL_SECONDS = Number(process.env.KEEPER_POLL_SECONDS ?? (/api\.(devnet|testnet|mainnet-beta)\.solana\.com/.test(RPC) ? "45" : "15"));
const HEALTH_PORT = Number(process.env.KEEPER_HEALTH_PORT ?? "8787");
const PRIORITY_MICRO_LAMPORTS = Number(process.env.KEEPER_PRIORITY_MICRO_LAMPORTS ?? "20000");
/** The tip + receipt rent the program will take from the float. Mirrors the program. */
const KEEPER_TIP = 500_000n;
/** How often a linear schedule is vested. Every vest costs the payer's float a receipt's rent. */
const VEST_EVERY_SECONDS = Number(process.env.KEEPER_VEST_HOURS ?? "24") * 3600;

function loadKeypair(): Keypair {
  const raw = process.env.SCRIP_KEEPER_KEYPAIR?.trim();
  if (!raw) throw new Error("SCRIP_KEEPER_KEYPAIR is not set. The keeper needs a keypair with SOL.");
  const json = raw.startsWith("[") ? raw : readFileSync(raw, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]));
}

const keeper = loadKeypair();
const conn = makeConnection(RPC, { wsEndpoint: process.env.NEXT_PUBLIC_SOLANA_WS?.trim() || undefined });
const pyth = new PythSolanaReceiver({ connection: conn, wallet: new Wallet(keeper) });

const startedAt = Math.floor(Date.now() / 1000);
const reports = new Map<string, KeeperBookReport>();
let sweeps = 0;
let ticking = false;
let wakeRequested = false;

function log(...parts: unknown[]): void {
  console.log(new Date().toISOString(), ...parts);
}

function report(pda: string, owner: string, patch: Partial<KeeperBookReport>): void {
  const prev = reports.get(pda) ?? { owner, lastSeenAt: 0, lastSweepAt: null, lastSweepSig: null, lastReason: null, failures: 0 };
  reports.set(pda, { ...prev, ...patch, lastSeenAt: Math.floor(Date.now() / 1000) });
}

// ── the books ─────────────────────────────────────────────────────────────────────────────

async function listBooks(): Promise<Array<{ pda: PublicKey; book: Book; lamports: number; dataLen: number }>> {
  const accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Book")] });
  const out: Array<{ pda: PublicKey; book: Book; lamports: number; dataLen: number }> = [];
  for (const { pubkey, account } of accounts) {
    const b = decodeBook(account.data);
    if (b.ok) out.push({ pda: pubkey, book: b.value, lamports: account.lamports, dataLen: account.data.length });
  }
  return out;
}

// ── the price ─────────────────────────────────────────────────────────────────────────────

type PriceSource = { account: PublicKey; posted: boolean; feed: PriceFeed; adjusted: boolean; close: () => Promise<void> };

/**
 * A fresh, fully verified price account for EITHER of the book's two feeds.
 *
 * The program accepts either — that is why a Book carries two — and the two fail in
 * different weather. `Crypto.SPYX/USD` prices the token and was meant to be the around-the-
 * clock one; `Equity.US.SPY/USD` prices a share and is pushed while the market has a price.
 * On mainnet on 2026-09-21 it is the reverse of the design's assumption: the raw feed's
 * sponsored account was NINE DAYS stale and Hermes answers 403 for it on any affordable
 * plan, while the adjusted account was seven seconds old. A keeper that only ever read the
 * raw feed could therefore never sweep SPYx on mainnet at all.
 *
 * Order: each pinned on-chain account first, because it is free and permissionless and
 * needs no API key; then a Hermes update this keeper posts and closes after.
 */
async function priceFor(book: Book, asset: Asset): Promise<Outcome<PriceSource>> {
  // Only a feed the book itself named. The registry may know more than this book agreed to.
  const candidates: Array<{ feed: PriceFeed; adjusted: boolean }> = [];
  if (asset.feedRaw && asset.feedRaw.feedId === book.feedRaw) candidates.push({ feed: asset.feedRaw, adjusted: false });
  if (asset.feedAdjusted && asset.feedAdjusted.feedId === book.feedAdjusted) candidates.push({ feed: asset.feedAdjusted, adjusted: true });
  if (candidates.length === 0) return held("neither of the book's feeds is the registry's");

  const now = Math.floor(Date.now() / 1000);
  for (const c of candidates) {
    if (!c.feed.account) continue;
    const pinned = await readPriceAccount(conn, new PublicKey(c.feed.account), c.feed.feedId, c.feed.label);
    if (pinned.ok && settleable(pinned.value, now + 45, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok) {
      return ok({ account: new PublicKey(c.feed.account), posted: false, feed: c.feed, adjusted: c.adjusted, close: async () => {} });
    }
  }

  // Nothing on chain is usable. Post one, trying each feed: an API plan that refuses one
  // asset class may still carry the other, and a 403 for one feed is not a 403 for both.
  let feed = candidates[0]!.feed;
  let adjusted = candidates[0]!.adjusted;
  let update: HermesLatest | undefined;
  let lastWhy = "no feed was reachable";
  for (const c of candidates) {
    const fresh = await hermesLatest([c.feed.feedId]);
    if (!fresh.ok) {
      lastWhy = `${c.feed.label}: ${fresh.why}`;
      continue;
    }
    if (!fresh.value[0]) {
      lastWhy = `${c.feed.label}: Hermes returned no update`;
      continue;
    }
    feed = c.feed;
    adjusted = c.adjusted;
    update = fresh.value[0];
    break;
  }
  if (!update) return held(lastWhy);

  // Full verification: the encoded VAA is written and verified over several transactions,
  // then posted. Atomic posting would be one transaction but only partially verified, and
  // the program refuses partial.
  const builder = pyth.newTransactionBuilder({ closeUpdateAccounts: false });
  await builder.addPostPriceUpdates([update.binaryBase64]);
  const txs = await builder.buildVersionedTransactions({ computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS });
  await pyth.provider.sendAll(txs, { skipPreflight: false, commitment: "confirmed" });
  const account = builder.getPriceUpdateAccount(feed.feedId);
  const posted = await readPriceAccount(conn, account, feed.feedId, feed.label);
  if (!posted.ok) return posted;
  const closeIxs = builder.closeInstructions;
  return ok({
    account,
    posted: true,
    feed,
    adjusted,
    close: async () => {
      if (closeIxs.length === 0) return;
      try {
        const closeTxs = await TransactionBuilder.batchIntoVersionedTransactions(keeper.publicKey, conn, closeIxs, {
          computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS,
        });
        await pyth.provider.sendAll(closeTxs, { skipPreflight: true, commitment: "confirmed" });
      } catch (err) {
        log("could not close the price update account:", err instanceof Error ? err.message : err);
      }
    },
  });
}

// ── one book, one look ────────────────────────────────────────────────────────────────────

async function evaluate(entry: { pda: PublicKey; book: Book; lamports: number; dataLen: number }, usdcInfo: AccountInfo<Buffer> | null): Promise<void> {
  const { pda, book } = entry;
  const key = pda.toBase58();
  const owner = new PublicKey(book.owner);
  const usdcMint = new PublicKey(book.usdcMint);
  const now = Math.floor(Date.now() / 1000);

  if (!book.rule.enabled) return;
  if (book.pending) {
    report(key, book.owner, { lastReason: "a sweep is pending on chain; waiting" });
    return;
  }

  // The owner's USDC account: balance and delegate. Read for every book in ONE request by
  // the caller — a call per book made the keeper the loudest thing on the endpoint, and on a
  // public one that is a budget the app also needs.
  const usdcAddr = usdcAta(owner, usdcMint);
  if (!usdcInfo) {
    report(key, book.owner, { lastReason: "no USDC account yet" });
    return;
  }
  const usdc = unpackAccount(usdcAddr, usdcInfo, usdcInfo.owner);
  if (!usdc.delegate || !usdc.delegate.equals(pda) || usdc.delegatedAmount === 0n) {
    report(key, book.owner, { lastReason: usdc.delegate && !usdc.delegate.equals(pda) ? "paused: another delegate replaced the Book" : "paused: the delegate is revoked" });
    return;
  }

  // Spending is not income: lower the watermark so the next arrival counts.
  if (usdc.amount < book.rule.watermark) {
    const ix = syncWatermarkIx(owner, usdcMint);
    if (ix.ok) {
      try {
        const sig = await sendAndConfirm(conn, new Transaction().add(ix.value), [keeper]);
        log(`sync_watermark ${key.slice(0, 8)} → ${usdc.amount} (${sig.slice(0, 8)}…)`);
      } catch (err) {
        log("sync_watermark failed:", err instanceof Error ? err.message : err);
      }
    }
    report(key, book.owner, { lastReason: "balance fell below the watermark; synced, nothing to sweep" });
    return;
  }

  const rate = effectiveRate(book.rule.rateBps, book.rule.escalateBps, book.rule.enabledUnix, now);
  const slice = computeSlice({
    balance: usdc.amount,
    watermark: book.rule.watermark,
    minInbound: book.rule.minInbound,
    cap: book.rule.capUsdc,
    floor: book.rule.floorUsdc,
    rateBps: rate,
  });
  if (!slice.ok) {
    report(key, book.owner, { lastReason: slice.why });
    return;
  }
  if (usdc.delegatedAmount < slice.value.slice) {
    report(key, book.owner, { lastReason: `allowance exhausted: ${usdc.delegatedAmount} left, slice needs ${slice.value.slice}` });
    return;
  }

  const asset = assetByMint(book.asset);
  if (!asset) {
    report(key, book.owner, { lastReason: `asset ${book.asset.slice(0, 6)}… is not on the registry (no route on ${CLUSTER})` });
    return;
  }
  if (CLUSTER !== "mainnet-beta") {
    report(key, book.owner, { lastReason: `${slice.value.slice} USDC is sweepable, but there is no Jupiter on ${CLUSTER}` });
    return;
  }

  // The float must cover the tip, the receipt and, on a first sweep, the owner's asset account.
  const rent = Number(await rentFor(conn, entry.dataLen));
  const receiptRent = Number(await rentFor(conn, 8 + 344));
  const ownerAsset = assetAta(owner, asset);
  const ownerAssetInfo = await conn.getAccountInfo(ownerAsset, "confirmed");
  const ataRent = ownerAssetInfo ? 0n : await rentFor(conn, 170);
  const float = BigInt(entry.lamports - rent);
  if (float < KEEPER_TIP + BigInt(receiptRent) + ataRent) {
    report(key, book.owner, { lastReason: `float empty: ${float} lamports, a sweep needs ${KEEPER_TIP + BigInt(receiptRent) + ataRent}` });
    return;
  }

  // The price, then the least that must arrive.
  const price = await priceFor(book, asset);
  if (!price.ok) {
    report(key, book.owner, { lastReason: `waiting for a fresh price: ${price.why}` });
    return;
  }
  try {
    const p = await readPriceAccount(conn, price.value.account, price.value.feed.feedId);
    if (!p.ok) throw new Error(p.why);

    // A feed that prices a SHARE needs the mint's live scaled-UI multiplier to become a
    // token amount, which is exactly what finish_sweep does on its side. Getting this wrong
    // is not a safety hole — the program checks the delivered amount itself — but a min-out
    // computed against the wrong denomination either submits a doomed transaction or
    // refuses a fill the program would have taken.
    let multiplierE12: bigint | null = null;
    if (price.value.adjusted) {
      const read = await readMintMultiplier(conn, asset, Math.floor(Date.now() / 1000));
      if (!read.ok) throw new Error(`the adjusted feed prices a share and the multiplier could not be read: ${read.why}`);
      if (read.value.kind === "scaled") {
        const live = multiplierInForce(read.value.snapshot, Math.floor(Date.now() / 1000));
        if (!live.ok) throw new Error(`the adjusted feed prices a share and the multiplier is not usable: ${live.why}`);
        multiplierE12 = decimalToE12(live.value.value);
        if (multiplierE12 <= 0n) throw new Error("the multiplier did not convert to fixed point");
      }
    }

    const min = minOutRaw({
      sliceUsdc: slice.value.slice,
      toleranceBps: book.rule.toleranceBps,
      price: p.value.price,
      conf: p.value.conf,
      expo: p.value.expo,
      assetDecimals: asset.decimals,
      multiplierE12,
    });
    if (!min.ok) throw new Error(min.why);

    // The route.
    let quote = await jupQuote({ inputMint: USDC_MINT, outputMint: asset.mint, amount: slice.value.slice, slippageBps: book.rule.toleranceBps, maxAccounts: 24 });
    if (!quote.ok) throw new Error(quote.why);
    if (BigInt(quote.value.outAmount) < min.value) {
      report(key, book.owner, { lastReason: `route too thin: Jupiter offers ${quote.value.outAmount}, Pyth requires ${min.value}` });
      await price.value.close();
      return;
    }
    let swap = await swapInstructions({ quote: quote.value, userPublicKey: keeper.publicKey, destinationTokenAccount: ownerAsset });
    if (!swap.ok) throw new Error(swap.why);
    let alts = await lookupTables(conn, swap.value.lookupTableAddresses);
    if (!alts.ok) throw new Error(alts.why);

    const releaseId = newReleaseId();
    const build = async (s: typeof swap, a: typeof alts) => {
      if (!s.ok) throw new Error(s.why);
      if (!a.ok) throw new Error(a.why);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      const tx = buildSweepTransaction({
        keeper: keeper.publicKey,
        owner,
        usdcMint,
        asset,
        releaseId,
        priceUpdate: price.value.account,
        route: [...s.value.setup, s.value.swap, ...(s.value.cleanup ? [s.value.cleanup] : [])],
        lookupTables: a.value,
        recentBlockhash: blockhash,
        priorityMicroLamports: PRIORITY_MICRO_LAMPORTS,
      });
      return { tx, blockhash, lastValidBlockHeight };
    };
    let built = await build(swap, alts);
    if (!built.tx.ok && /1232/.test(built.tx.why)) {
      // Too big: ask for a direct route with fewer accounts and try once more.
      quote = await jupQuote({ inputMint: USDC_MINT, outputMint: asset.mint, amount: slice.value.slice, slippageBps: book.rule.toleranceBps, maxAccounts: 16, onlyDirectRoutes: true });
      if (!quote.ok) throw new Error(quote.why);
      if (BigInt(quote.value.outAmount) < min.value) throw new Error(`direct route too thin: ${quote.value.outAmount} < ${min.value}`);
      swap = await swapInstructions({ quote: quote.value, userPublicKey: keeper.publicKey, destinationTokenAccount: ownerAsset });
      if (!swap.ok) throw new Error(swap.why);
      alts = await lookupTables(conn, swap.value.lookupTableAddresses);
      if (!alts.ok) throw new Error(alts.why);
      built = await build(swap, alts);
    }
    if (!built.tx.ok) throw new Error(built.tx.why);

    built.tx.value.sign([keeper]);
    const sig = await conn.sendTransaction(built.tx.value, { skipPreflight: false, maxRetries: 3 });
    const landed = await confirmSignature(conn, sig, built.lastValidBlockHeight);
    if (!landed.ok) throw new Error(landed.why);
    sweeps += 1;
    report(key, book.owner, { lastSweepAt: Math.floor(Date.now() / 1000), lastSweepSig: sig, lastReason: null });
    log(`swept ${slice.value.slice} USDC → ${asset.symbol} for ${book.owner.slice(0, 8)}… (${sig})`);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const prev = reports.get(key);
    report(key, book.owner, { lastReason: `sweep failed: ${why.slice(0, 200)}`, failures: (prev?.failures ?? 0) + 1 });
    log(`sweep failed for ${key.slice(0, 8)}…: ${why}`);
  } finally {
    await price.value.close();
  }
}

// ── the loop ──────────────────────────────────────────────────────────────────────────────

const subscribed = new Set<string>();

// ── grants ────────────────────────────────────────────────────────────────────────────────

const lastVestAt = new Map<string, number>();
let vests = 0;
let grantsWatched = 0;
const mintProgram = new Map<string, "spl-token" | "token-2022">();

/** The registry's asset, or a stand-in whose token program is read from the mint. */
async function assetFor(mint: string): Promise<Pick<Asset, "mint" | "program"> | null> {
  const known = assetByMint(mint);
  if (known) return known;
  if (CLUSTER === "mainnet-beta") return null;
  let program = mintProgram.get(mint);
  if (!program) {
    const info = await conn.getAccountInfo(new PublicKey(mint), "confirmed");
    if (!info) return null;
    program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? "token-2022" : "spl-token";
    mintProgram.set(mint, program);
  }
  return { mint, program };
}

async function listGrants(): Promise<Array<{ address: PublicKey; grant: Grant; lamports: number; dataLen: number }>> {
  const accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Grant")] });
  const out: Array<{ address: PublicKey; grant: Grant; lamports: number; dataLen: number }> = [];
  for (const { pubkey, account } of accounts) {
    const g = decodeGrant(account.data);
    if (g.ok) out.push({ address: pubkey, grant: g.value, lamports: account.lamports, dataLen: account.data.length });
  }
  return out;
}

/**
 * Vest what the schedule has released, on a cadence: at the cliff, once a day along a
 * linear schedule, and whenever the remainder is all releasable. Each vest writes a receipt
 * from the payer's float, so vesting every fifteen seconds would be spending their money on
 * paper. The program decides the amount; the keeper only decides when to ask.
 */
async function vestDue(): Promise<void> {
  const grantsNow = await listGrants();
  grantsWatched = grantsNow.filter((g) => g.grant.sealed && g.grant.state !== "completed").length;
  const now = Math.floor(Date.now() / 1000);
  for (const { address, grant, lamports, dataLen } of grantsNow) {
    if (!grant.sealed || grant.state === "completed") continue;
    const releasable = releasableRaw(grant, now);
    if (releasable <= 0n) continue;
    const cap = grant.releaseCapRaw !== null && grant.releaseCapRaw < grant.totalRaw ? grant.releaseCapRaw : grant.totalRaw;
    const final = grant.releasedRaw + releasable >= cap;
    const first = grant.releasedRaw === 0n;
    const key = address.toBase58();
    const last = lastVestAt.get(key) ?? 0;
    if (!final && !first && now - last < VEST_EVERY_SECONDS) continue;
    const rent = Number(await rentFor(conn, dataLen));
    const receiptRent = Number(await rentFor(conn, 8 + 360));
    if (BigInt(lamports - rent) < KEEPER_TIP + BigInt(receiptRent)) {
      log(`grant ${key.slice(0, 8)}…: float too low to vest; waiting`);
      continue;
    }
    const asset = await assetFor(grant.asset);
    if (!asset) continue;
    const idBytes = Uint8Array.from(Buffer.from(grant.grantId, "hex"));
    const ix = vestIx({ keeper: keeper.publicKey, payer: new PublicKey(grant.payer), recipient: new PublicKey(grant.recipient), grantId: idBytes, releaseId: newReleaseId(), asset });
    if (!ix.ok) {
      log(`grant ${key.slice(0, 8)}…: ${ix.why}`);
      continue;
    }
    try {
      const sig = await sendAndConfirm(conn, new Transaction().add(ix.value), [keeper]);
      lastVestAt.set(key, now);
      vests += 1;
      log(`vested ${releasable} raw of grant ${key.slice(0, 8)}… → ${grant.recipient.slice(0, 8)}…: ${sig}`);
    } catch (err) {
      log(`vest failed for ${key.slice(0, 8)}…:`, err instanceof Error ? err.message : err);
    }
  }
}

async function tick(): Promise<void> {
  if (ticking) {
    wakeRequested = true;
    return;
  }
  ticking = true;
  try {
    try {
      await vestDue();
    } catch (err) {
      log("vesting failed:", err instanceof Error ? err.message : err);
    }
    const books = await listBooks();
    const live = books.filter((b) => b.book.rule.enabled);
    // Every watched USDC account in one request, in batches the endpoint accepts.
    const addresses = live.map((b) => usdcAta(new PublicKey(b.book.owner), new PublicKey(b.book.usdcMint)));
    const infos: Array<AccountInfo<Buffer> | null> = [];
    for (let i = 0; i < addresses.length; i += 100) {
      infos.push(...(await conn.getMultipleAccountsInfo(addresses.slice(i, i + 100), "confirmed")));
    }
    for (const [n, entry] of live.entries()) {
      // Wake on the owner's USDC account changing, so a sweep follows an arrival in seconds.
      const ata = addresses[n]!.toBase58();
      if (!subscribed.has(ata)) {
        subscribed.add(ata);
        conn.onAccountChange(new PublicKey(ata), () => void tick(), "confirmed");
      }
      try {
        await evaluate(entry, infos[n] ?? null);
      } catch (err) {
        log(`evaluate failed for ${entry.pda.toBase58().slice(0, 8)}…:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    log("tick failed:", err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
    if (wakeRequested) {
      wakeRequested = false;
      void tick();
    }
  }
}

function health(): KeeperHealth {
  return {
    at: Math.floor(Date.now() / 1000),
    keeper: keeper.publicKey.toBase58(),
    cluster: CLUSTER,
    hermes: hermesKey() ? "keyed" : "keyless",
    books: Object.fromEntries(reports),
    sweeps,
    vests,
    grantsWatched,
    startedAt,
  };
}

async function main(): Promise<void> {
  log(`scrip keeper ${keeper.publicKey.toBase58()} on ${CLUSTER} via ${RPC}`);
  log(`program ${SCRIP_PROGRAM_ID.toBase58()}; hermes ${hermesKey() ? "keyed" : "KEYLESS — mainnet sweeps will wait for a fresh price forever"}`);
  const sol = await conn.getBalance(keeper.publicKey);
  log(`keeper balance ${(sol / 1e9).toFixed(4)} SOL`);
  if (sol < 20_000_000) log("WARNING: under 0.02 SOL; a sweep advances rent before it is repaid");

  // The keeper's own USDC account must EXIST before the first sweep. `begin_sweep` moves the
  // slice from the owner's account, through the delegate, into this one, and Anchor refuses
  // an uninitialised destination with AccountNotInitialized (0xbc4) — which is what both
  // mainnet keepers hit on the very first real arrival. A sweep does NOT create it: the
  // sweep is the thing that needs it. So the keeper creates its own, once, idempotently.
  // About 0.00204 SOL of rent, which comes back if the account is ever closed.
  {
    const mint = new PublicKey(USDC_MINT);
    const ata = getAssociatedTokenAddressSync(mint, keeper.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const info = await conn.getAccountInfo(ata, "confirmed");
    if (info) {
      log(`keeper USDC account ${ata.toBase58()}`);
    } else {
      log(`keeper USDC account ${ata.toBase58()} does not exist; creating it`);
      const ix = createAssociatedTokenAccountIdempotentInstruction(keeper.publicKey, ata, keeper.publicKey, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const made = await sendAndConfirm(conn, new Transaction().add(ix), [keeper]);
      log(`keeper USDC account created: ${made}`);
    }
  }

  // Warn about the multiplier state of every registered rebasing mint, once, for the log.
  for (const mint of ["XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W"]) {
    const asset = assetByMint(mint);
    if (!asset || CLUSTER !== "mainnet-beta") continue;
    const read = await readMintMultiplier(conn, asset, Math.floor(Date.now() / 1000));
    if (read.ok && read.value.kind === "scaled") {
      const live = multiplierInForce(read.value.snapshot, Math.floor(Date.now() / 1000));
      log(`${asset.symbol} multiplier ${live.ok ? live.value.raw : live.why}${read.value.paused ? " — PAUSED by the issuer" : ""}`);
      // Which of the two feeds could actually settle a sweep right now. One glance answers
      // "can mainnet settle?", which the old line could not: it always named the raw feed.
      const at = Math.floor(Date.now() / 1000);
      for (const f of [asset.feedRaw, asset.feedAdjusted]) {
        if (!f) continue;
        if (!f.account) {
          log(`  ${f.label}: no pinned account; only Hermes can supply it`);
          continue;
        }
        const read2 = await readPriceAccount(conn, new PublicKey(f.account), f.feedId, f.label);
        if (!read2.ok) {
          log(`  ${f.label}: unreadable — ${read2.why}`);
          continue;
        }
        const usable = settleable(read2.value, at + 45, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS);
        log(`  ${f.label}: ${at - read2.value.publishedAt}s old — ${usable.ok ? "USABLE" : `not settleable, ${usable.why}`}`);
      }
    }
  }

  createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(health()));
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(HEALTH_PORT, () => log(`health on :${HEALTH_PORT}/health`));

  await tick();
  setInterval(() => void tick(), Math.max(5, POLL_SECONDS) * 1000);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { tokenProgramFor, MIN_SLICE, bookPda };
