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
 * The program decides the amount, the price bound and the receipt. It cannot omit the check
 * or deliver less than the minimum — both are refused on chain, and this process finds out by
 * paying a fee. The program does NOT require the whole slice to be delivered: a keeper could
 * deliver the minimum and keep the rest, up to about the tolerance plus Pyth's band. This one
 * never does: it quotes the whole slice with the owner's account as the destination. Making
 * that a rule for every keeper is the next program upgrade.
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
import { type AccountInfo, ComputeBudgetProgram, Keypair, PublicKey, type Signer, Transaction, type VersionedTransaction } from "@solana/web3.js";
import { type Asset, type PriceFeed, USDC_MINT, assetByMint } from "@/lib/assets/registry";
import { type Book, type Grant, decodeBook, decodeGrant, decodeMember, decodePlan, releasableRaw } from "@/lib/book/decode";
import { matchReceiptIx } from "@/lib/plan/instructions";
import * as curveFees from "@/lib/curve/claims";
import { DEPLOYED as CURVE } from "@/lib/curve/deployed";
import { launchesOnChain, partnerPositionOf } from "@/lib/curve/launches";
import { vestIx } from "@/lib/grant/instructions";
import { multiplierInForce } from "@/lib/corporate-actions/multiplier";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import type { KeeperBookReport, KeeperHealth } from "@/lib/keeper/health";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type HermesLatest, hermesKey, latest as hermesLatest } from "@/lib/pyth/hermes";
import { eachAtMost, finishesWithin, standingBy as standingByFor } from "@/lib/keeper/pool";
import { matchRefusedForGood } from "@/lib/plan/refusal";
import { readPriceAccount } from "@/lib/pyth/read";
import { settleable } from "@/lib/pyth/price";
import { decimalToE12, minOutRaw } from "@/lib/rule/min-out";
import { assetAta, syncWatermarkIx, tokenProgramFor, usdcAta } from "@/lib/rule/instructions";
import { FEED_MAX_AGE_SECONDS, MAX_CONF_BPS, MIN_SLICE, computeSlice, effectiveRate } from "@/lib/rule/slice";
import { SCRIP_PROGRAM_ID, bookPda, discriminatorFilter, newReleaseId, receiptPda } from "@/lib/solana/program";
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
// 100,000 microlamports on the 600,000 units a sweep reserves is 60,000 lamports: an eighth of
// the tip the sweep repays, for a transaction that lands in the first slots instead of later.
const PRIORITY_MICRO_LAMPORTS = Number(process.env.KEEPER_PRIORITY_MICRO_LAMPORTS ?? "100000");
/**
 * What a keeper must hold before it posts a price: the encoded VAA's rent and the price
 * update's (both returned at close), and the fees of the five or so transactions it takes.
 */
const MIN_POST_LAMPORTS = Number(process.env.KEEPER_MIN_POST_LAMPORTS ?? "8000000");
/**
 * ONE POSTED PRICE PER FEED, SHARED BY EVERY SAVE FOR EIGHT MINUTES. The program accepts a price
 * up to ten minutes old, so a price this keeper posted serves every book on that stock until then:
 * hundreds of saves need one post, not hundreds, and every save after the first skips the five
 * transactions a post takes. 0 turns sharing off.
 */
const SHARE_PRICE_SECONDS = Number(process.env.KEEPER_SHARE_PRICE_SECONDS ?? "480");
/** Below this the operator is told, so a keeper never runs dry unnoticed again. */
const ALERT_MIN_LAMPORTS = Number(process.env.KEEPER_ALERT_MIN_LAMPORTS ?? "20000000");
/** Money that has waited this long to be saved is worth a message to the operator. */
const STUCK_AFTER_SECONDS = Number(process.env.KEEPER_STUCK_AFTER_SECONDS ?? "600");
/** The tip + receipt rent the program will take from the float. Mirrors the program. */
const KEEPER_TIP = 500_000n;
/** The smallest save Scrip's keepers submit; below it the receipt's cost is too large a share. */
const KEEPER_MIN_SLICE = BigInt(process.env.KEEPER_MIN_SLICE_USDC ?? "2000000");
/**
 * The front book — Scrip's own, the one /proof invites a stranger to try with $5 — saves from the
 * program's own minimum instead: its prepaid saves are Scrip's money, and a $5 test at 10% is a
 * $0.50 slice that the $2 batching would otherwise leave waiting, with no receipt, in front of a judge.
 */
const FRONT_BOOK = process.env.NEXT_PUBLIC_FRONT_BOOK?.trim() || null;
/** How often a linear schedule is vested. Every vest costs the payer's float a receipt's rent. */
const VEST_EVERY_SECONDS = Number(process.env.KEEPER_VEST_HOURS ?? "24") * 3600;
/**
 * MANY SAVES AT ONCE. A round used to save one register after another, so when fifty people
 * were paid in the same minute the fiftieth waited for forty-nine sends and confirmations. Now
 * this many go out together; each is its own transaction, paid back inside itself, so they
 * share nothing but the price, which is posted once per stock however many are waiting on it.
 */
const CONCURRENCY = Math.max(1, Number(process.env.KEEPER_CONCURRENCY ?? "6"));
/**
 * NO ONE SAVE HOLDS UP THE REST. A save that has not finished in this long stops holding the
 * round: the others go on, and that register is not tried again until its first try returns.
 */
const EVALUATE_DEADLINE_MS = Number(process.env.KEEPER_DEADLINE_SECONDS ?? "150") * 1000;
/** A round that has not finished in this long is stuck; the process exits and pm2 restarts it. */
const WATCHDOG_MS = Number(process.env.KEEPER_WATCHDOG_SECONDS ?? "600") * 1000;
/**
 * A SECOND SERVICE THAT WAITS ITS TURN. Two services racing for the same save both pay to send
 * it, and one always loses. With this set, this service acts only on money that has already
 * waited this long — which never happens while the first is up — so it costs nothing until the
 * day it is needed. 0, the default, acts at once.
 */
const BACKUP_AFTER_SECONDS = Number(process.env.KEEPER_BACKUP_AFTER_SECONDS ?? "0");

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
/**
 * TELLING THE OPERATOR, NEVER THE USER. A stuck save or a keeper running low is Scrip's problem
 * to fix, so it goes to the operator's Telegram (TELEGRAM_BOT_TOKEN and SCRIP_ALERT_CHAT_ID) and
 * the log, at most once per key per interval; nothing about it is shown to the person saving.
 */
const alerted = new Map<string, number>();
async function alert(key: string, text: string, everyMs: number): Promise<void> {
  const last = alerted.get(key) ?? 0;
  if (Date.now() - last < everyMs) return;
  alerted.set(key, Date.now());
  log(`ALERT ${text}`);
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.SCRIP_ALERT_CHAT_ID?.trim();
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `Scrip saving service ${keeper.publicKey.toBase58().slice(0, 4)}: ${text}`, disable_web_page_preview: true }),
    });
  } catch {
    // The log has it.
  }
}
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** When a book's money first became saveable and was not yet saved. */
const waitingSince = new Map<string, number>();
function stuck(key: string, owner: string, usdc: bigint, reason: string, everyMs: number): void {
  const since = waitingSince.get(key);
  if (since === undefined) return;
  const waited = Math.floor(Date.now() / 1000) - since;
  if (waited < STUCK_AFTER_SECONDS) return;
  void alert(`stuck:${key}:${everyMs}`, `$${(Number(usdc) / 1e6).toFixed(2)} has waited ${Math.round(waited / 60)} min to be saved for ${owner.slice(0, 4)}…${owner.slice(-4)}: ${reason.slice(0, 220)}`, everyMs);
}

/** Whether this service, if it is a backup, still leaves something first seen at `since` alone. */
const standingBy = (since: number, now: number) => standingByFor(BACKUP_AFTER_SECONDS, since, now);
/** When a register's balance first fell below its watermark, for a backup's patience. */
const lowSince = new Map<string, number>();

const reports = new Map<string, KeeperBookReport>();
let sweeps = 0;
let ticking = false;
let wakeRequested = false;
/** Registers with a save still in flight, so a slow one is never started twice. */
const evaluating = new Set<string>();
let lastRoundAt = Date.now();
/** The last time a start woke this service, so a burst of wakes costs one round, not many. */
let lastWakeAt = 0;
const WAKE_GAP_MS = 2_000;

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
 * THE MATCH, AFTER A SWEEP. Every Plan that counts this owner as an active member adds its
 * share of the slice, priced by Pyth, capped by the member's month and the Plan's escrow; the
 * program checks all of it, this only asks. Nothing here can fail a sweep.
 *
 * A match is its own transaction, so a refused read or a dropped transaction used to lose it
 * for good: a sponsor's promise not kept, with nothing anywhere to say so. Now a save waits here
 * until every Plan has paid it or refused it for a reason that will not change, and is tried
 * again each round. An owner's saves go oldest first, because the program refuses a save older
 * than the last one it matched. Six tries, then the operator is told.
 */
type PendingMatch = { receipt: PublicKey; sweptAsset: Asset; tries: number };
const pendingMatches = new Map<string, PendingMatch[]>();
const draining = new Set<string>();
const MATCH_TRIES = 6;

async function matchAfterSweep(owner: PublicKey, receipt: PublicKey, sweptAsset: Asset, sweptPrice: PriceSource): Promise<void> {
  const key = owner.toBase58();
  const queue = pendingMatches.get(key) ?? [];
  queue.push({ receipt, sweptAsset, tries: 0 });
  pendingMatches.set(key, queue);
  await drainMatches(owner, sweptPrice);
}

/** Every waiting match of one owner, oldest first, stopping at the first that has to wait. */
async function drainMatches(owner: PublicKey, sweptPrice: PriceSource | null): Promise<void> {
  const key = owner.toBase58();
  if (draining.has(key)) return;
  draining.add(key);
  try {
    const queue = pendingMatches.get(key) ?? [];
    while (queue.length > 0) {
      const next = queue[0]!;
      if ((await matchOnce(owner, next.receipt, next.sweptAsset, sweptPrice)) === "done") {
        queue.shift();
        continue;
      }
      next.tries += 1;
      if (next.tries < MATCH_TRIES) break;
      queue.shift();
      void alert(`match:${next.receipt.toBase58()}`, `a Plan match for ${key.slice(0, 4)}…${key.slice(-4)}'s save ${next.receipt.toBase58().slice(0, 8)}… was not paid after ${MATCH_TRIES} tries`, DAY_MS);
    }
    if (queue.length === 0) pendingMatches.delete(key);
  } finally {
    draining.delete(key);
  }
}

/** One try at every Plan counting this owner: "done" once each has paid it or refused it for good. */
async function matchOnce(owner: PublicKey, receipt: PublicKey, sweptAsset: Asset, sweptPrice: PriceSource | null): Promise<"done" | "wait"> {
  const who = owner.toBase58().slice(0, 8);
  let members;
  try {
    members = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [discriminatorFilter("Member"), { memcmp: { offset: 8 + 32, bytes: owner.toBase58() } }],
    });
  } catch (err) {
    log(`looking for plans of ${who}…: ${err instanceof Error ? err.message : String(err)}`);
    return "wait";
  }
  let waiting = false;
  for (const { account } of members) {
    const m = decodeMember(account.data);
    if (!m.ok || m.value.status !== "active") continue;
    const planKey = new PublicKey(m.value.plan);
    const planInfo = await conn.getAccountInfo(planKey, "confirmed").catch(() => undefined);
    if (planInfo === undefined) {
      waiting = true;
      continue;
    }
    const plan = planInfo ? decodePlan(planInfo.data) : null;
    if (!plan || !plan.ok) continue;
    const planAsset = assetByMint(plan.value.asset);
    if (!planAsset) continue;
    // The sweep's own fresh price when the Plan pays in the same stock; otherwise the Plan's.
    let source: PriceSource | null = sweptPrice && planAsset.mint === sweptAsset.mint ? sweptPrice : null;
    let opened: PriceSource | null = null;
    if (!source) {
      const p = await priceFor({ feedRaw: planAsset.feedRaw?.feedId ?? "", feedAdjusted: planAsset.feedAdjusted?.feedId ?? "" } as Book, planAsset);
      if (!p.ok) {
        log(`match for ${who}… in plan ${planKey.toBase58().slice(0, 8)}… waits: ${p.why}`);
        waiting = true;
        continue;
      }
      source = opened = p.value;
    }
    try {
      const ix = matchReceiptIx({ caller: keeper.publicKey, plan: planKey, owner, receipt, priceUpdate: source.account, asset: planAsset });
      if (!ix.ok) throw new Error(ix.why);
      const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICRO_LAMPORTS }), ix.value);
      const sig = await sendAndConfirm(conn, tx, [keeper]);
      log(`matched ${who}…'s save from plan ${planKey.toBase58().slice(0, 8)}… (${sig})`);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      if (matchRefusedForGood(why)) {
        log(`match for ${who}… in plan ${planKey.toBase58().slice(0, 8)}… refused for good: ${why.slice(0, 160)}`);
      } else {
        log(`match for ${who}… in plan ${planKey.toBase58().slice(0, 8)}… not paid yet: ${why.slice(0, 200)}`);
        waiting = true;
      }
    } finally {
      if (opened) await opened.close();
    }
  }
  return waiting ? "wait" : "done";
}

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
  return priceFrom(candidates);
}

/**
 * A START IS BEING APPROVED: have its stock's price ready by the time it lands. Asked by the
 * site the moment somebody taps Start; the price is the one every save shares for eight
 * minutes, so this costs at most one post per stock in that time, and only when no usable price
 * exists. Until 9 October the first save waited for this post after the start had landed: about
 * ten of the sixteen seconds between starting and the stock arriving. A backup never warms.
 */
async function warmPrice(asset: Asset): Promise<void> {
  if (BACKUP_AFTER_SECONDS > 0 || CLUSTER !== "mainnet-beta") return;
  // The same feeds, in the same order, as a register opened on this stock names, so the save
  // that follows finds this price shared, or joins this post while it is still in flight.
  const candidates: Array<{ feed: PriceFeed; adjusted: boolean }> = [];
  if (asset.feedRaw) candidates.push({ feed: asset.feedRaw, adjusted: false });
  if (asset.feedAdjusted) candidates.push({ feed: asset.feedAdjusted, adjusted: true });
  if (candidates.length === 0) return;
  const r = await priceFrom(candidates);
  log(r.ok ? `price ready for ${asset.symbol} before a start lands` : `could not ready a ${asset.symbol} price: ${r.why}`);
}

async function priceFrom(candidates: ReadonlyArray<{ feed: PriceFeed; adjusted: boolean }>): Promise<Outcome<PriceSource>> {
  const now = Math.floor(Date.now() / 1000);
  for (const c of candidates) {
    if (!c.feed.account) continue;
    const pinned = await readPriceAccount(conn, new PublicKey(c.feed.account), c.feed.feedId, c.feed.label);
    if (pinned.ok && settleable(pinned.value, now + 45, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok) {
      return ok({ account: new PublicKey(c.feed.account), posted: false, feed: c.feed, adjusted: c.adjusted, close: async () => {} });
    }
  }

  // A price this keeper already posted, still young enough for the program: shared, free.
  for (const c of candidates) {
    const hit = sharedPrices.get(c.feed.feedId);
    if (hit && now - hit.publishTime < SHARE_PRICE_SECONDS) {
      return ok({ account: hit.account, posted: true, feed: c.feed, adjusted: c.adjusted, close: async () => {} });
    }
  }

  // Nothing on chain is usable: post one. Saves waiting on the same stock wait on the same post.
  if (SHARE_PRICE_SECONDS <= 0) return postPrice(candidates);
  const postKey = candidates.map((c) => c.feed.feedId).join(",");
  const inflight = posting.get(postKey);
  if (inflight) return inflight;
  const p = postPrice(candidates).finally(() => posting.delete(postKey));
  posting.set(postKey, p);
  return p;
}

/** Posts in flight, by the feeds they were asked for, so concurrent saves share one. */
const posting = new Map<string, Promise<Outcome<PriceSource>>>();

/**
 * Post a fresh, fully verified price for the first of `candidates` Hermes will give, trying
 * each feed: an API plan that refuses one asset class may still carry the other, and a 403 for
 * one feed is not a 403 for both.
 */
async function postPrice(candidates: ReadonlyArray<{ feed: PriceFeed; adjusted: boolean }>): Promise<Outcome<PriceSource>> {
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
    const u = fresh.value[0];
    if (!u) {
      lastWhy = `${c.feed.label}: Hermes returned no update`;
      continue;
    }
    // Never post a price the program would refuse. Hermes answers a closed market with its last
    // price, so on a Friday evening gold's update was already older than the ten minutes the
    // program allows: the keeper posted it, the sweep failed PriceStale, and it tried again,
    // about sixty times in three hours, until its SOL was gone (9 October). Checked here with the
    // program's own bounds, nothing is spent and the save waits for a price that can settle.
    const now = Math.floor(Date.now() / 1000);
    const usable = settleable({ feedId: u.feedId, price: u.price, conf: u.conf, expo: u.expo, publishedAt: u.publishTime, verification: "full" }, now + 45, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS);
    if (!usable.ok) {
      lastWhy = `${c.feed.label}: the newest price is ${Math.max(0, Math.round((now - u.publishTime) / 60))} min old, so the market is closed or quiet; the save waits for a price the program will accept`;
      continue;
    }
    feed = c.feed;
    adjusted = c.adjusted;
    update = u;
    break;
  }
  if (!update) return held(lastWhy);

  // Posting rents two accounts (the encoded VAA and the price update) until they are closed.
  // A keeper that cannot cover them would pay fees for a post that fails halfway, so it says
  // what it needs instead of trying.
  const lamports = await conn.getBalance(keeper.publicKey, "confirmed").catch(() => null);
  if (lamports !== null && lamports < MIN_POST_LAMPORTS) {
    return held(`this keeper holds ${(lamports / 1e9).toFixed(4)} SOL; posting a ${feed.label} price needs about ${(MIN_POST_LAMPORTS / 1e9).toFixed(3)} SOL, returned when the accounts close`);
  }

  // Full verification: the encoded VAA is written and verified over several transactions,
  // then posted. Atomic posting would be one transaction but only partially verified, and
  // the program refuses partial.
  const builder = pyth.newTransactionBuilder({ closeUpdateAccounts: false });
  await builder.addPostPriceUpdates([update.binaryBase64]);
  // Taken BEFORE anything is sent: every account the post creates has its close instruction
  // here, so whatever happens after the first transaction lands, the rent comes back. On
  // 8 October a lookup that threw after the post (below) skipped this and leaked the rent of
  // every attempt until both keepers were empty.
  const closeIxs = [...builder.closeInstructions];
  const closeAll = async () => {
    if (closeIxs.length === 0) return;
    try {
      const closeTxs = await TransactionBuilder.batchIntoVersionedTransactions(keeper.publicKey, conn, closeIxs, {
        computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS,
      });
      await sendSigned(closeTxs);
    } catch (err) {
      log("could not close the posted price accounts:", err instanceof Error ? err.message : err);
    }
  };
  const txs = await builder.buildVersionedTransactions({ computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS });
  try {
    await sendSigned(txs, true);
  } catch (err) {
    await closeAll();
    return held(`posting the ${feed.label} price failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
  }
  let account: PublicKey;
  try {
    // The library keys what it posted by the feed id WITH its 0x prefix; the registry stores
    // the bare hex. Asking with the bare hex threw "No price update account found".
    account = builder.getPriceUpdateAccount(`0x${feed.feedId.replace(/^0x/, "")}`);
  } catch (err) {
    await closeAll();
    return held(`the posted ${feed.label} price could not be found: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
  }
  const posted = await readPriceAccount(conn, account, feed.feedId, feed.label);
  if (!posted.ok) {
    await closeAll();
    return posted;
  }
  if (SHARE_PRICE_SECONDS <= 0) return ok({ account, posted: true, feed, adjusted, close: closeAll });
  // Shared from here: the encoded VAA has done its job and closes now; the price update stays
  // open for every save on this feed until it is too old, then closes (expireSharedPrices).
  const vaaCloses = closeIxs.filter((ix) => ix.instruction.programId.equals(pyth.wormhole.programId));
  const updateCloses = closeIxs.filter((ix) => !ix.instruction.programId.equals(pyth.wormhole.programId));
  await closeSome(vaaCloses);
  sharedPrices.set(feed.feedId, { account, publishTime: posted.value.publishedAt, closes: updateCloses });
  return ok({ account, posted: true, feed, adjusted, close: async () => {} });
}

type CloseIx = Awaited<ReturnType<typeof pyth.buildClosePriceUpdateInstruction>>;
/** Posted prices this keeper shares, by feed id, until they are too old for the program. */
const sharedPrices = new Map<string, { account: PublicKey; publishTime: number; closes: CloseIx[] }>();

/**
 * Send the price library's transactions, signed here, one after another. Anchor's provider did
 * this until 9 October, and when one failed it fetched the transaction for its logs without
 * asking for version 0, which the RPC refuses: every failure read "Transaction version (0) is not
 * supported", and the real one was lost. `strict` throws on a failure, so a post that fails
 * halfway is closed by its caller; otherwise a failure is logged and left for reclaimLeftovers.
 */
async function sendSigned(txs: ReadonlyArray<{ tx: VersionedTransaction; signers: Signer[] }>, strict = false): Promise<void> {
  for (const { tx, signers } of txs) {
    tx.sign([keeper, ...signers]);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: !strict, maxRetries: 3 });
    const done = await conn.confirmTransaction(sig, "confirmed").catch((err: unknown) => ({ value: { err: err instanceof Error ? err.message : String(err) } }));
    if (done.value.err) {
      const why = `${sig.slice(0, 8)}… failed: ${JSON.stringify(done.value.err).slice(0, 160)}`;
      if (strict) throw new Error(why);
      log(why);
    }
  }
}

async function closeSome(ixs: CloseIx[]): Promise<void> {
  if (ixs.length === 0) return;
  try {
    const txs = await TransactionBuilder.batchIntoVersionedTransactions(keeper.publicKey, conn, ixs, { computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS });
    await sendSigned(txs);
  } catch (err) {
    // Left for reclaimLeftovers, which finds any account of this keeper's and closes it.
    log("could not close posted price accounts now:", err instanceof Error ? err.message : err);
  }
}

/** Close every shared price that is too old for the program, returning its rent. Between rounds. */
async function expireSharedPrices(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const [feedId, entry] of sharedPrices) {
    if (now - entry.publishTime < SHARE_PRICE_SECONDS) continue;
    sharedPrices.delete(feedId);
    await closeSome(entry.closes);
  }
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
    waitingSince.delete(key);
    report(key, book.owner, { lastReason: usdc.delegate && !usdc.delegate.equals(pda) ? "paused: another delegate replaced the Book" : "paused: the delegate is revoked" });
    return;
  }

  // Spending is not income: lower the watermark so the next arrival counts.
  if (usdc.amount < book.rule.watermark) {
    const low = lowSince.get(key) ?? now;
    lowSince.set(key, low);
    if (standingBy(low, now)) {
      report(key, book.owner, { lastReason: "the balance fell below the watermark; standing by while the first service syncs it" });
      return;
    }
    lowSince.delete(key);
    const ix = syncWatermarkIx(owner, usdcMint);
    if (ix.ok) {
      try {
        const sig = await sendAndConfirm(conn, new Transaction().add(ix.value), [keeper]);
        log(`sync_watermark ${key.slice(0, 8)} → ${usdc.amount} (${sig.slice(0, 8)}…)`);
      } catch (err) {
        log("sync_watermark failed:", err instanceof Error ? err.message : err);
      }
    }
    waitingSince.delete(key);
    report(key, book.owner, { lastReason: "balance fell below the watermark; synced, nothing to sweep" });
    return;
  }
  lowSince.delete(key);

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
    waitingSince.delete(key);
    report(key, book.owner, { lastReason: slice.why });
    return;
  }
  // SCRIP'S KEEPERS WAIT FOR $2. Every save writes a receipt that costs about 0.003 SOL, so a
  // 50-cent save would spend most of itself. The program allows a slice down to MIN_SLICE; this
  // keeper waits until the unswept slice reaches the policy minimum, which batches small
  // payments into one save. Another keeper may sweep sooner: keepers are permissionless.
  // A register's FIRST save goes at the program's own minimum: it is the one a new saver
  // watches happen, seconds after starting with their last payment (`lib/start/first.ts`).
  if (slice.value.slice < KEEPER_MIN_SLICE && book.slug !== FRONT_BOOK && book.rule.sweeps > 0) {
    waitingSince.delete(key);
    report(key, book.owner, { lastReason: `waiting for $${Number(KEEPER_MIN_SLICE) / 1e6} to save: the slice is ${slice.value.slice} USDC base units` });
    return;
  }
  // From here the money is saveable; how long it waits is the operator's business.
  if (!waitingSince.has(key)) waitingSince.set(key, now);
  if (standingBy(waitingSince.get(key)!, now)) {
    report(key, book.owner, { lastReason: `standing by: the first service saves this; this one steps in after ${BACKUP_AFTER_SECONDS} s` });
    return;
  }
  if (usdc.delegatedAmount < slice.value.slice) {
    report(key, book.owner, { lastReason: `allowance exhausted: ${usdc.delegatedAmount} left, slice needs ${slice.value.slice}` });
    stuck(key, book.owner, slice.value.slice, "the saver's limit is used up", DAY_MS);
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
    stuck(key, book.owner, slice.value.slice, "the saver's prepaid saves are used up", DAY_MS);
    return;
  }

  // The price, then the least that must arrive.
  const price = await priceFor(book, asset);
  if (!price.ok) {
    report(key, book.owner, { lastReason: `waiting for a fresh price: ${price.why}` });
    // A closed market is expected and said on the page; a keeper that cannot post is not.
    const ours = /keeper holds|posting the|could not be found/.test(price.why);
    stuck(key, book.owner, slice.value.slice, `no price: ${price.why}`, ours ? HOUR_MS : DAY_MS);
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
    const raw = built.tx.value.serialize();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
    // Re-broadcast the same bytes until the network has seen them: a dropped sweep otherwise
    // waits out its blockhash, and "seconds later" becomes a minute.
    const landed = await confirmSignature(conn, sig, built.lastValidBlockHeight, "confirmed", () =>
      conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }),
    );
    if (!landed.ok) throw new Error(landed.why);
    sweeps += 1;
    waitingSince.delete(key);
    report(key, book.owner, { lastSweepAt: Math.floor(Date.now() / 1000), lastSweepSig: sig, lastReason: null });
    log(`swept ${slice.value.slice} USDC → ${asset.symbol} for ${book.owner.slice(0, 8)}… (${sig})`);
    // The match, if a sponsor's Plan counts this owner as a member: its own transaction, after
    // the save, so nothing about it can hold up or undo the sweep that just landed.
    await matchAfterSweep(owner, receiptPda(bookPda(owner), releaseId), asset, price.value);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const prev = reports.get(key);
    report(key, book.owner, { lastReason: `sweep failed: ${why.slice(0, 200)}`, failures: (prev?.failures ?? 0) + 1 });
    log(`sweep failed for ${key.slice(0, 8)}…: ${why}`);
    stuck(key, book.owner, slice.value.slice, `the save keeps failing: ${why}`, HOUR_MS);
  } finally {
    await price.value.close();
  }
}

// ── the loop ──────────────────────────────────────────────────────────────────────────────

const subscribed = new Set<string>();

// ── Scrip Curve: launch fees into the Plan ────────────────────────────────────────────────

/**
 * EVERY LAUNCH FEE, INTO ITS PLAN, BY ITSELF. Every Scrip Curve config names this service as its
 * fee claimer; Meteora lets the claimer choose where a fee goes, and this only ever names the Plan
 * in the curve's own stock (`src/lib/curve/deployed.json`). On a cadence it walks every launch on
 * every config, read from the chain (anyone can launch, so there is no other list), and moves the
 * curve's partner fee and, after graduation, the locked position's fee straight into that Plan's
 * escrow, and the partner's graduation fee once (DBC pays that one to the claimer, so it is
 * forwarded the same minute). The Plan then matches savers' automatic saves from it. A backup
 * never claims.
 */
const CURVE_EVERY_MS = Number(process.env.KEEPER_CURVE_MINUTES ?? "30") * 60_000;
/** Below this a claim costs more in fees than it moves: 1,000 base units, under a cent of any curve stock. */
const CURVE_MIN_RAW = BigInt(process.env.KEEPER_CURVE_MIN_RAW ?? "1000");
let lastCurveAt = 0;

async function launchFeesToPlan(): Promise<void> {
  if (BACKUP_AFTER_SECONDS > 0 || CLUSTER !== "mainnet-beta") return;
  if (CURVE.feeClaimer !== keeper.publicKey.toBase58() || Object.keys(CURVE.plans).length === 0) return;
  if (Date.now() - lastCurveAt < CURVE_EVERY_MS) return;
  lastCurveAt = Date.now();
  const launches = await launchesOnChain(conn);
  if (!launches.ok) {
    log(`launch fees: ${launches.why}`);
    return;
  }
  for (const launch of launches.value) {
    const plan = CURVE.plans[launch.stock];
    if (!plan) continue;
    const planKey = new PublicKey(plan.address);
    const label = launch.symbol ?? launch.pool.slice(0, 6);
    const partner = launch.dammPool ? await partnerPositionOf(conn, launch.dammPool, keeper.publicKey.toBase58()) : null;
    const source = { pool: launch.pool, stock: launch.stock, dammPool: launch.dammPool, partner };
    const waiting = await curveFees.feesWaiting(conn, source);
    if (!waiting.ok) {
      log(`${label}: launch fees could not be read: ${waiting.why}`);
      continue;
    }
    const w = waiting.value;
    try {
      if (w.onCurve >= CURVE_MIN_RAW) {
        const tx = await curveFees.curveFeeToPlan(conn, { pool: launch.pool, claimer: keeper.publicKey, plan: planKey, amount: w.onCurve });
        if (tx.ok) log(`${label}: ${w.onCurve} base units of ${launch.stock} launch fee into its Plan (${(await sendAndConfirm(conn, tx.value, [keeper])).slice(0, 8)}…)`);
      }
      if (w.graduationFeeWaiting) {
        const account = curveFees.claimerQuoteAccount(keeper.publicKey, launch.stock);
        const before = BigInt((await conn.getTokenAccountBalance(account, "confirmed").catch(() => null))?.value.amount ?? "0");
        const tx = await curveFees.migrationFeeWithdraw(conn, { pool: launch.pool, claimer: keeper.publicKey });
        if (tx.ok) {
          await sendAndConfirm(conn, tx.value, [keeper]);
          const after = BigInt((await conn.getTokenAccountBalance(account, "confirmed")).value.amount);
          if (after > before) {
            const fwd = new Transaction().add(curveFees.forwardToPlan({ claimer: keeper.publicKey, escrow: new PublicKey(plan.escrow), amount: after - before, stock: launch.stock }));
            log(`${label}: ${after - before} base units of graduation fee into its Plan (${(await sendAndConfirm(conn, fwd, [keeper])).slice(0, 8)}…)`);
          }
        }
      }
      if (w.onPosition >= CURVE_MIN_RAW) {
        const tx = await curveFees.positionFeeToPlan(conn, { source, claimer: keeper.publicKey, plan: planKey });
        if (tx.ok) log(`${label}: ${w.onPosition} base units of graduated-pool fee into its Plan (${(await sendAndConfirm(conn, tx.value, [keeper])).slice(0, 8)}…)`);
      }
    } catch (err) {
      log(`${label}: moving launch fees into its Plan failed:`, err instanceof Error ? err.message : err);
    }
  }
}

// ── grants ────────────────────────────────────────────────────────────────────────────────

const lastVestAt = new Map<string, number>();
/** For a backup: each grant's released amount, what kind of vest is due, and since when. */
const vestSeen = new Map<string, { released: bigint; kind: "first" | "final" | "linear"; since: number }>();
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
    if (BACKUP_AFTER_SECONDS > 0) {
      // A backup vests only what the first service has left alone: a cliff or an end not
      // vested within its patience, or a schedule that has not moved for a whole cadence more.
      const kind = first ? "first" : final ? "final" : "linear";
      const seen = vestSeen.get(key);
      if (!seen || seen.released !== grant.releasedRaw || seen.kind !== kind) {
        vestSeen.set(key, { released: grant.releasedRaw, kind, since: now });
        continue;
      }
      const patience = kind === "linear" ? VEST_EVERY_SECONDS + BACKUP_AFTER_SECONDS : BACKUP_AFTER_SECONDS;
      if (now - seen.since < patience) continue;
    } else if (!final && !first && now - last < VEST_EVERY_SECONDS) continue;
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

let lastReclaimAt = 0;
const RECLAIM_EVERY_MS = 10 * 60_000;

/**
 * EVERY PRICE ACCOUNT THIS KEEPER POSTED AND DID NOT CLOSE, CLOSED. A close that times out
 * leaves its rent behind, and only this keeper can take it back. Run at the start of a round,
 * never during one: rounds do not overlap and every account a round posts is closed inside it,
 * so nothing closed here is in use. Once at start-up, then every ten minutes.
 */
async function reclaimLeftovers(): Promise<void> {
  if (Date.now() - lastReclaimAt < RECLAIM_EVERY_MS) return;
  lastReclaimAt = Date.now();
  const me = keeper.publicKey.toBase58();
  const [updates, vaas] = await Promise.all([
    conn.getProgramAccounts(pyth.receiver.programId, { commitment: "confirmed", dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 8, bytes: me } }] }),
    conn.getProgramAccounts(pyth.wormhole.programId, { commitment: "confirmed", dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 9, bytes: me } }] }),
  ]);
  const lamports = await conn.getBalance(keeper.publicKey, "confirmed").catch(() => null);
  if (lamports !== null && lamports < ALERT_MIN_LAMPORTS) {
    void alert("low-balance", `holds ${(lamports / 1e9).toFixed(4)} SOL. Send 0.03 SOL to ${me} so saves that need a fresh price keep working.`, HOUR_MS);
  }
  const inUse = new Set([...sharedPrices.values()].map((e) => e.account.toBase58()));
  const leftovers = updates.filter((u) => !inUse.has(u.pubkey.toBase58()));
  if (leftovers.length + vaas.length === 0) return;
  const ixs = [
    ...(await Promise.all(leftovers.map((u) => pyth.buildClosePriceUpdateInstruction(u.pubkey)))),
    ...(await Promise.all(vaas.map((v) => pyth.buildCloseEncodedVaaInstruction(v.pubkey)))),
  ];
  const txs = await TransactionBuilder.batchIntoVersionedTransactions(keeper.publicKey, conn, ixs, { computeUnitPriceMicroLamports: PRIORITY_MICRO_LAMPORTS });
  await sendSigned(txs);
  log(`closed ${ixs.length} leftover price account(s); their rent is back with this keeper`);
}

async function tick(): Promise<void> {
  if (ticking) {
    wakeRequested = true;
    return;
  }
  ticking = true;
  try {
    try {
      await expireSharedPrices();
      await reclaimLeftovers();
    } catch (err) {
      log("closing leftover price accounts failed:", err instanceof Error ? err.message : err);
    }
    try {
      await vestDue();
    } catch (err) {
      log("vesting failed:", err instanceof Error ? err.message : err);
    }
    try {
      await launchFeesToPlan();
    } catch (err) {
      log("launch fees failed:", err instanceof Error ? err.message : err);
    }
    const books = await listBooks();
    const live = books.filter((b) => b.book.rule.enabled);
    // Every watched USDC account in one request, in batches the endpoint accepts.
    const addresses = live.map((b) => usdcAta(new PublicKey(b.book.owner), new PublicKey(b.book.usdcMint)));
    const infos: Array<AccountInfo<Buffer> | null> = [];
    for (let i = 0; i < addresses.length; i += 100) {
      infos.push(...(await conn.getMultipleAccountsInfo(addresses.slice(i, i + 100), "confirmed")));
    }
    for (const address of addresses) {
      // Wake on the owner's USDC account changing, so a sweep follows an arrival in seconds.
      const ata = address.toBase58();
      if (!subscribed.has(ata)) {
        subscribed.add(ata);
        conn.onAccountChange(address, () => void tick(), "confirmed");
      }
    }
    await eachAtMost(CONCURRENCY, live.map((entry, n) => ({ entry, info: infos[n] ?? null })), async ({ entry, info }) => {
      const key = entry.pda.toBase58();
      if (evaluating.has(key)) return;
      evaluating.add(key);
      const run = evaluate(entry, info)
        .catch((err) => log(`evaluate failed for ${key.slice(0, 8)}…:`, err instanceof Error ? err.message : err))
        .finally(() => evaluating.delete(key));
      if (!(await finishesWithin(run, EVALUATE_DEADLINE_MS))) {
        log(`the save for ${key.slice(0, 8)}… is still running after ${EVALUATE_DEADLINE_MS / 1000} s; the round goes on without it`);
      }
    });
    // Matches that had to wait, tried again: oldest first for each owner.
    for (const owner of [...pendingMatches.keys()]) {
      await drainMatches(new PublicKey(owner), null).catch((err) => log("matching again failed:", err instanceof Error ? err.message : err));
    }
  } catch (err) {
    log("tick failed:", err instanceof Error ? err.message : err);
  } finally {
    lastRoundAt = Date.now();
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
    concurrency: CONCURRENCY,
    backupAfterSeconds: BACKUP_AFTER_SECONDS,
    inFlight: evaluating.size,
    lastRoundAt: Math.floor(lastRoundAt / 1000),
    matchesWaiting: [...pendingMatches.values()].reduce((n, q) => n + q.length, 0),
  };
}

async function main(): Promise<void> {
  // The endpoint's host only: a paid RPC's key travels in the query string, and logs are read.
  log(`scrip keeper ${keeper.publicKey.toBase58()} on ${CLUSTER} via ${RPC.replace(/[?#].*$/, "").replace(/\/[^/]{24,}$/, "/…")}`);
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
    // A START JUST LANDED: look now instead of at the next poll. A new register's USDC account is
    // not watched until a round has listed it, so without this its first save waited up to a
    // whole poll interval while the saver watched. It can only make this service look sooner,
    // and looks are spaced at least WAKE_GAP_MS apart however often it is asked. Only the site on
    // the same machine may ask: this port also answers /health to the world, and every look reads
    // the chain on Scrip's endpoint.
    if (req.url === "/wake" && req.method === "POST") {
      const from = req.socket.remoteAddress ?? "";
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(from)) {
        res.writeHead(403);
        res.end();
        return;
      }
      // An optional body names a stock whose price to ready: a start is being approved.
      let body = "";
      req.on("data", (chunk: Buffer) => {
        if (body.length < 1_024) body += chunk.toString("utf8");
      });
      req.on("end", () => {
        let mint: unknown = null;
        try {
          mint = (JSON.parse(body || "{}") as { mint?: unknown }).mint;
        } catch {
          mint = null;
        }
        const asset = typeof mint === "string" ? assetByMint(mint) : undefined;
        if (asset) void warmPrice(asset).catch((err) => log("readying a price failed:", err instanceof Error ? err.message : err));
        const now = Date.now();
        const woke = !asset && now - lastWakeAt >= WAKE_GAP_MS;
        if (woke) {
          lastWakeAt = now;
          void tick();
        }
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ woke, warming: Boolean(asset) }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(HEALTH_PORT, () => log(`health on :${HEALTH_PORT}/health`));

  log(
    `${CONCURRENCY} saves at once, ${EVALUATE_DEADLINE_MS / 1000} s each before the round moves on; ${
      BACKUP_AFTER_SECONDS > 0 ? `a backup: steps in after ${BACKUP_AFTER_SECONDS} s` : "acts at once"
    }`,
  );
  await tick();
  setInterval(() => void tick(), Math.max(5, POLL_SECONDS) * 1000);
  // A round that never finishes is the one failure nothing else catches: every save would wait
  // on it. pm2 restarts a process that exits, so a stuck one exits.
  setInterval(() => {
    const quiet = Date.now() - lastRoundAt;
    if (quiet < WATCHDOG_MS) return;
    log(`no round has finished in ${Math.round(quiet / 1000)} s; exiting so pm2 starts this service again`);
    void Promise.race([alert("watchdog", `no round finished in ${Math.round(quiet / 60_000)} min; it restarted itself`, 0), new Promise((r) => setTimeout(r, 5_000))]).finally(() =>
      process.exit(1),
    );
  }, 60_000);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { tokenProgramFor, MIN_SLICE, bookPda };
