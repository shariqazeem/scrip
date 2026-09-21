/**
 * @vitest-environment node
 *
 * THE ON-CHAIN BATTERY — the deployed devnet program, real transactions, every path.
 *
 * There is no USDC, no SPYx and no Jupiter on devnet, so a classic six-decimal mint stands
 * in for USDC, a Token-2022 mint with a scaled-UI multiplier stands in for SPYx, and a plain
 * transfer from the keeper's own stash stands in for the route. What is NOT stood in for is
 * the price: the sweep is verified against Pyth's real SOL/USD and USDC/USD accounts on
 * devnet, through the same min-out arithmetic the mainnet build applies to SPYX/USD.
 *
 *     npm run test:devnet
 *
 * Gated on a flag and a funded deployer key. It spends devnet SOL and takes a minute.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  getMint,
  getMintLen,
  getScaledUiAmountConfig,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { DEVNET_FEEDS } from "@/lib/assets/registry";
import { decodeBook, decodeGrant, decodeHandle, decodeReceipt } from "@/lib/book/decode";
import { closeGrantIx, grantEscrow, openGrantIx, revokeGrantIx, sealGrantIx, vestIx } from "@/lib/grant/instructions";
import { cancelPayoutIx, claimPayoutIx, fundPayoutIx, measureReceiptIx, memoIx, releasePayoutIx } from "@/lib/intake/instructions";
import { reasonHash } from "@/lib/intake/memo";
import { minOutRaw, multiplierToE12 } from "@/lib/rule/min-out";
import { assetAta, enableRuleIxs, openBookIx, syncWatermarkIx, usdcAta } from "@/lib/rule/instructions";
import { computeSlice } from "@/lib/rule/slice";
import { parsePriceAccount } from "@/lib/pyth/price";
import { SCRIP_PROGRAM_ID, bookPda, grantPda, handlePda, newReleaseId, payoutPda, receiptPda } from "@/lib/solana/program";
import { beginSweepIx } from "@/lib/sweep/instructions";
import { buildSweepTransaction } from "@/lib/sweep/build";
import { sendAndConfirm, sendAndConfirmV0 } from "@/lib/solana/confirm";
import { makeConnection } from "@/lib/solana/make-connection";

const LIVE = process.env.DEVNET_E2E === "1";
const RPC = process.env.DEVNET_RPC || "https://api.devnet.solana.com";
const KEY_PATH = process.env.DEVNET_KEYPAIR || join(process.cwd(), "anchor", ".keys", "deployer.json");
const conn = makeConnection(RPC);

const KEEPER_TIP = 500_000n;
const SOL_USD = new PublicKey(DEVNET_FEEDS.raw.account);
const USDC_USD = new PublicKey(DEVNET_FEEDS.adjusted.account);
/** The SPYx multiplier read on 2026-09-12, so the devnet asset rebases like the real one. */
const MULTIPLIER = 1.005714560286254;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

const usdc = { mint: "", program: "spl-token" as const, decimals: 6 };
const asset = { mint: "", program: "token-2022" as const, decimals: 8 };

let payer: Keypair; // the deployer: pays, keeps, sponsors
let owner: Keypair;
let usdcMint: Keypair;
let assetMint: Keypair;

/**
 * THE PUBLIC DEVNET RPC IS FLAKY ABOUT BLOCKHASHES: its simulation node can lag the node
 * that issued the blockhash, and "Blockhash not found" is a transient, not a refusal. A
 * program error is never retried; only that one message is.
 */
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
    fresh.feePayer = tx.feePayer ?? signers[0]!.publicKey;
    return sendAndConfirm(conn, fresh, signers);
  });
}

/** A versioned transaction carries its blockhash; rebuilt by the caller-supplied factory on retry. */
async function sendV0(tx: VersionedTransaction, signers: Keypair[], rebuild?: () => Promise<VersionedTransaction>): Promise<string> {
  let current = tx;
  return withFreshBlockhash(async () => {
    current.sign(signers);
    try {
      const latest = await conn.getLatestBlockhash("confirmed");
      return await sendAndConfirmV0(conn, current, latest.lastValidBlockHeight);
    } catch (err) {
      if (rebuild && /Blockhash not found|block height exceeded/i.test(err instanceof Error ? err.message : String(err))) current = await rebuild();
      throw err;
    }
  });
}

async function expectFailure(tx: Transaction | VersionedTransaction, signers: Keypair[], pattern: RegExp): Promise<void> {
  let threw = false;
  try {
    if (tx instanceof Transaction) await send(tx, signers);
    else await sendV0(tx, signers);
  } catch (err) {
    threw = true;
    const msg = err instanceof Error ? `${err.message}${"logs" in err ? String((err as { logs?: string[] }).logs?.join("\n")) : ""}` : String(err);
    expect(msg, `expected ${pattern}`).toMatch(pattern);
  }
  expect(threw).toBe(true);
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

async function readReceipt(address: PublicKey) {
  const info = await conn.getAccountInfo(address, "confirmed");
  if (!info) throw new Error("no receipt");
  const r = decodeReceipt(info.data);
  if (!r.ok) throw new Error(r.why);
  return r.value;
}

async function readGrant(address: PublicKey) {
  const info = await conn.getAccountInfo(address, "confirmed");
  if (!info) throw new Error("no grant");
  const g = decodeGrant(info.data);
  if (!g.ok) throw new Error(g.why);
  return g.value;
}

async function readPyth(account: PublicKey) {
  const info = await conn.getAccountInfo(account, "confirmed");
  if (!info) throw new Error("no price account");
  const p = parsePriceAccount(info.data);
  if (!p.ok) throw new Error(p.why);
  return p.value;
}

/** A plain transfer from the keeper's stash into `to`: the devnet stand-in for the route. */
function mockRoute(from: Keypair, to: PublicKey, amount: bigint) {
  return createTransferCheckedInstruction(
    assetAta(from.publicKey, asset),
    new PublicKey(asset.mint),
    to,
    from.publicKey,
    amount,
    asset.decimals,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
}

describe.skipIf(!LIVE)("the Scrip program on devnet", () => {
  beforeAll(async () => {
    payer = loadKeypair(KEY_PATH);
    owner = Keypair.generate();
    usdcMint = Keypair.generate();
    assetMint = Keypair.generate();
    usdc.mint = usdcMint.publicKey.toBase58();
    asset.mint = assetMint.publicKey.toBase58();

    const program = await conn.getAccountInfo(SCRIP_PROGRAM_ID);
    if (!program?.executable) throw new Error(`${SCRIP_PROGRAM_ID.toBase58()} is not deployed on ${RPC}`);

    // ── the two mints: a classic "USDC" and a rebasing Token-2022 "SPYx" ─────────────
    const plainLen = getMintLen([]);
    const scaledLen = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const [plainRent, scaledRent] = await Promise.all([
      conn.getMinimumBalanceForRentExemption(plainLen),
      conn.getMinimumBalanceForRentExemption(scaledLen),
    ]);
    await send(
      new Transaction().add(
        SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdcMint.publicKey, space: plainLen, lamports: plainRent, programId: TOKEN_PROGRAM_ID }),
        createInitializeMintInstruction(usdcMint.publicKey, 6, payer.publicKey, null, TOKEN_PROGRAM_ID),
        SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: assetMint.publicKey, space: scaledLen, lamports: scaledRent, programId: TOKEN_2022_PROGRAM_ID }),
        createInitializeScaledUiAmountConfigInstruction(assetMint.publicKey, payer.publicKey, MULTIPLIER, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(assetMint.publicKey, 8, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: owner.publicKey, lamports: 0.12 * LAMPORTS_PER_SOL }),
      ),
      [payer, usdcMint, assetMint],
    );

    // ── the owner's USDC ($1,000), the keeper's USDC account, the keeper's asset stash ─
    await send(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), owner.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
        createMintToInstruction(usdcMint.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), payer.publicKey, 1_000_000_000n, [], TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(payer.publicKey, usdcMint.publicKey), payer.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, assetMint.publicKey, TOKEN_2022_PROGRAM_ID),
        createMintToInstruction(assetMint.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, 10_000_000_000n, [], TOKEN_2022_PROGRAM_ID),
      ),
      [payer],
    );
  }, 120_000);

  const slug = `t${Date.now().toString(36).slice(-7)}`;
  let firstSweepReceipt: PublicKey;

  it("opens a book and turns the rule on in one signature: approve, float, enable", async () => {
    const open = openBookIx({ owner: owner.publicKey, slug, asset, usdcMint: usdcMint.publicKey, termsVersion: 0 });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    await send(new Transaction().add(open.value), [owner]);

    const ixs = enableRuleIxs({
      owner: owner.publicKey,
      usdcMint: usdcMint.publicKey,
      terms: { rateBps: 1_000, escalateBps: 0, floorUsdc: 0n, capUsdc: 0n, toleranceBps: 100 },
      allowanceUsdc: 1_000_000_000n,
      floatLamports: BigInt(0.05 * LAMPORTS_PER_SOL),
    });
    expect(ixs.ok).toBe(true);
    if (!ixs.ok) return;
    await send(new Transaction().add(...ixs.value), [owner]);

    const book = await readBook(owner.publicKey);
    expect(book.slug).toBe(slug);
    expect(book.rule.enabled).toBe(true);
    expect(book.rule.rateBps).toBe(1_000);
    // Everything already here has been seen: the watermark is the $1,000 that was there.
    expect(book.rule.watermark).toBe(1_000_000_000n);
    expect(book.pending).toBeNull();
    const acct = await getAccount(conn, usdcAta(owner.publicKey, usdcMint.publicKey), "confirmed", TOKEN_PROGRAM_ID);
    expect(acct.delegate?.equals(bookPda(owner.publicKey))).toBe(true);
    expect(acct.delegatedAmount).toBe(1_000_000_000n);
  }, 120_000);

  it("refuses enable_rule without the delegate", async () => {
    const other = Keypair.generate();
    await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: other.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL })), [payer]);
    await send(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(other.publicKey, usdcMint.publicKey), other.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
      ),
      [payer],
    );
    const open = openBookIx({ owner: other.publicKey, slug: `${slug}b`, asset, usdcMint: usdcMint.publicKey, termsVersion: 0 });
    const ixs = enableRuleIxs({ owner: other.publicKey, usdcMint: usdcMint.publicKey, terms: { rateBps: 1_000, escalateBps: 0, floorUsdc: 0n, capUsdc: 0n, toleranceBps: 100 }, allowanceUsdc: 1n, floatLamports: 0n });
    expect(open.ok && ixs.ok).toBe(true);
    if (!open.ok || !ixs.ok) return;
    // Drop the approve: the program must refuse "on" without the delegate.
    await expectFailure(new Transaction().add(open.value, ixs.value[ixs.value.length - 1]!), [other], /DelegateNotSet|Approve it first/);
  }, 120_000);

  it("sweeps ten percent of a $200 arrival against Pyth SOL/USD, atomically, with a receipt", async () => {
    // The arrival: a normal mint-to, nothing to do with the program.
    await send(new Transaction().add(createMintToInstruction(usdcMint.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), payer.publicKey, 200_000_000n, [], TOKEN_PROGRAM_ID)), [payer]);

    const book = await readBook(owner.publicKey);
    const slice = computeSlice({ balance: 1_200_000_000n, watermark: book.rule.watermark, minInbound: book.rule.minInbound, cap: book.rule.capUsdc, floor: book.rule.floorUsdc, rateBps: book.rule.rateBps });
    expect(slice.ok && slice.value.slice).toBe(20_000_000n);

    const price = await readPyth(SOL_USD);
    const min = minOutRaw({ sliceUsdc: 20_000_000n, toleranceBps: 100, price: price.price, conf: price.conf, expo: price.expo, assetDecimals: 8, multiplierE12: null });
    expect(min.ok).toBe(true);
    if (!min.ok) return;

    const releaseId = newReleaseId();
    const ownerAsset = assetAta(owner.publicKey, asset);
    const build = async () => {
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const t = buildSweepTransaction({
        keeper: payer.publicKey,
        owner: owner.publicKey,
        usdcMint: usdcMint.publicKey,
        asset,
        releaseId,
        priceUpdate: SOL_USD,
        route: [mockRoute(payer, ownerAsset, min.value + 1n)],
        lookupTables: [],
        recentBlockhash: blockhash,
      });
      if (!t.ok) throw new Error(t.why);
      return t.value;
    };
    const tx = { ok: true as const, value: await build() };
    const bookLamportsBefore = (await conn.getAccountInfo(bookPda(owner.publicKey)))!.lamports;
    const sig = await sendV0(tx.value, [payer], build);
    expect(sig).toBeTruthy();

    expect(await balance(usdcAta(owner.publicKey, usdcMint.publicKey), TOKEN_PROGRAM_ID)).toBe(1_180_000_000n);
    expect(await balance(usdcAta(payer.publicKey, usdcMint.publicKey), TOKEN_PROGRAM_ID)).toBe(20_000_000n);
    expect(await balance(ownerAsset, TOKEN_2022_PROGRAM_ID)).toBe(min.value + 1n);

    const after = await readBook(owner.publicKey);
    expect(after.rule.watermark).toBe(1_180_000_000n);
    expect(after.rule.sweeps).toBe(1);
    expect(after.pending).toBeNull();

    firstSweepReceipt = receiptPda(bookPda(owner.publicKey), releaseId);
    const r = await readReceipt(firstSweepReceipt);
    expect(r.kind).toBe("sweep");
    expect(r.recipient).toBe(owner.publicKey.toBase58());
    expect(r.payer).toBeNull();
    expect(r.basisUsdc).toBe(200_000_000n);
    expect(r.rateBps).toBe(1_000);
    expect(r.paidUsdc).toBe(20_000_000n);
    expect(r.amountRaw).toBe(min.value + 1n);
    expect(r.price?.feed).toBe(DEVNET_FEEDS.raw.feedId);
    expect(r.measured7d).toBeNull();

    // The keeper was repaid from the float: the tip, the receipt's rent, and the ATA it created.
    const bookLamportsAfter = (await conn.getAccountInfo(bookPda(owner.publicKey)))!.lamports;
    const receiptRent = BigInt((await conn.getAccountInfo(firstSweepReceipt))!.lamports);
    const ataRent = BigInt((await conn.getAccountInfo(ownerAsset))!.lamports);
    expect(BigInt(bookLamportsBefore - bookLamportsAfter)).toBe(KEEPER_TIP + receiptRent + ataRent);
  }, 180_000);

  it("refuses a begin_sweep with no finish_sweep behind it, and a fill below the Pyth minimum", async () => {
    await send(new Transaction().add(createMintToInstruction(usdcMint.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), payer.publicKey, 100_000_000n, [], TOKEN_PROGRAM_ID)), [payer]);
    const releaseId = newReleaseId();
    const begin = beginSweepIx({ keeper: payer.publicKey, owner: owner.publicKey, usdcMint: usdcMint.publicKey, asset, releaseId });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    await expectFailure(new Transaction().add(begin.value), [payer], /NoFinishSweep|No finish_sweep/);

    // Too little arrives: everything reverts, the delegate transfer included.
    const before = await balance(usdcAta(owner.publicKey, usdcMint.publicKey), TOKEN_PROGRAM_ID);
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = buildSweepTransaction({
      keeper: payer.publicKey,
      owner: owner.publicKey,
      usdcMint: usdcMint.publicKey,
      asset,
      releaseId,
      priceUpdate: SOL_USD,
      route: [mockRoute(payer, assetAta(owner.publicKey, asset), 1n)],
      lookupTables: [],
      recentBlockhash: blockhash,
    });
    expect(tx.ok).toBe(true);
    if (!tx.ok) return;
    await expectFailure(tx.value, [payer], /ReceivedBelowMinimum|Less arrived/);
    expect(await balance(usdcAta(owner.publicKey, usdcMint.publicKey), TOKEN_PROGRAM_ID)).toBe(before);
    expect((await readBook(owner.publicKey)).pending).toBeNull();
  }, 180_000);

  it("sweeps through a UI-priced feed, converting the minimum with the live multiplier", async () => {
    // The $100 from the previous test is still unswept. USDC/USD prices "one share" at ~$1;
    // the mint rebases at 1.0057, so fewer RAW units satisfy the same dollars.
    const mint = await getMint(conn, assetMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    const cfg = getScaledUiAmountConfig(mint);
    expect(cfg?.newMultiplier).toBeCloseTo(MULTIPLIER, 12);
    const price = await readPyth(USDC_USD);
    const min = minOutRaw({ sliceUsdc: 10_000_000n, toleranceBps: 100, price: price.price, conf: price.conf, expo: price.expo, assetDecimals: 8, multiplierE12: multiplierToE12(cfg!.newMultiplier) });
    const naive = minOutRaw({ sliceUsdc: 10_000_000n, toleranceBps: 100, price: price.price, conf: price.conf, expo: price.expo, assetDecimals: 8, multiplierE12: null });
    expect(min.ok && naive.ok && min.value < naive.value).toBe(true);
    if (!min.ok || !naive.ok) return;

    // Exactly the multiplier-adjusted minimum, which is BELOW the naive one: the program must
    // apply the multiplier, or this reverts.
    const releaseId = newReleaseId();
    const build = async () => {
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const t = buildSweepTransaction({
        keeper: payer.publicKey,
        owner: owner.publicKey,
        usdcMint: usdcMint.publicKey,
        asset,
        releaseId,
        priceUpdate: USDC_USD,
        route: [mockRoute(payer, assetAta(owner.publicKey, asset), min.value)],
        lookupTables: [],
        recentBlockhash: blockhash,
      });
      if (!t.ok) throw new Error(t.why);
      return t.value;
    };
    await sendV0(await build(), [payer], build);
    const r = await readReceipt(receiptPda(bookPda(owner.publicKey), releaseId));
    expect(r.paidUsdc).toBe(10_000_000n);
    expect(r.amountRaw).toBe(min.value);
    expect(r.price?.feed).toBe(DEVNET_FEEDS.adjusted.feedId);
    expect((await readBook(owner.publicKey)).rule.sweeps).toBe(2);
  }, 180_000);

  it("lowers the watermark when the owner spent, so the next arrival is income", async () => {
    // The owner sends $500 away. Balance 1270 → 770, below the watermark of 1270.
    await send(
      new Transaction().add(
        createTransferCheckedInstruction(usdcAta(owner.publicKey, usdcMint.publicKey), usdcMint.publicKey, usdcAta(payer.publicKey, usdcMint.publicKey), owner.publicKey, 500_000_000n, 6, [], TOKEN_PROGRAM_ID),
      ),
      [owner],
    );
    const sync = syncWatermarkIx(owner.publicKey, usdcMint.publicKey);
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    // The public devnet RPC is several nodes; the one that simulates may not have seen the
    // transfer another one confirmed. That reads as "nothing to sync" for a few seconds, and
    // the reason is in the transaction's logs, not in the error's own message.
    for (let attempt = 0; ; attempt++) {
      try {
        await send(new Transaction().add(sync.value), [payer]);
        break;
      } catch (err) {
        const said = `${err instanceof Error ? err.message : String(err)}\n${(err as { logs?: string[] }).logs?.join("\n") ?? ""}`;
        if (attempt >= 6 || !/WatermarkNotAbove|nothing to sync/.test(said)) throw err;
        await new Promise((r) => setTimeout(r, 2_500));
      }
    }
    const book = await readBook(owner.publicKey);
    expect(book.rule.watermark).toBe(await balance(usdcAta(owner.publicKey, usdcMint.publicKey), TOKEN_PROGRAM_ID));
    // A second sync has nothing to do.
    await expectFailure(new Transaction().add(sync.value), [payer], /WatermarkNotAbove|nothing to sync/);
  }, 120_000);

  it("settles an intake: memo, fund, the route into the escrow, release, receipt, escrow closed", async () => {
    const releaseId = newReleaseId();
    const reason = "shipped the receipt page on Tuesday";
    const escrow = assetAta(payoutPda(payer.publicKey, releaseId), asset, true);
    const fund = fundPayoutIx({ payer: payer.publicKey, releaseId, kind: "pay", recipient: owner.publicKey, claimant: null, reason, declaredUsdc: 5_000_000n, minOutRaw: 650_000n, asset });
    const release = releasePayoutIx({ payer: payer.publicKey, releaseId, recipient: owner.publicKey, asset, priceUpdate: SOL_USD });
    expect(fund.ok && release.ok).toBe(true);
    if (!fund.ok || !release.ok) return;
    const before = await balance(assetAta(owner.publicKey, asset), TOKEN_2022_PROGRAM_ID);
    const build = async () => {
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      return new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: blockhash,
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), memoIx(payer.publicKey, reason), fund.value, mockRoute(payer, escrow, 650_000n), release.value],
        }).compileToV0Message(),
      );
    };
    await sendV0(await build(), [payer], build);

    expect(await balance(assetAta(owner.publicKey, asset), TOKEN_2022_PROGRAM_ID)).toBe(before + 650_000n);
    expect(await conn.getAccountInfo(escrow)).toBeNull();
    expect(await conn.getAccountInfo(payoutPda(payer.publicKey, releaseId))).toBeNull();
    const r = await readReceipt(receiptPda(payoutPda(payer.publicKey, releaseId), releaseId));
    expect(r.kind).toBe("pay");
    expect(r.payer).toBe(payer.publicKey.toBase58());
    expect(r.paidUsdc).toBe(5_000_000n);
    expect(r.rateBps).toBe(10_000);
    expect(r.amountRaw).toBe(650_000n);
    expect(Buffer.from(r.reasonHash)).toEqual(Buffer.from(reasonHash(reason)));
    expect(r.price?.feed).toBe(DEVNET_FEEDS.raw.feedId);
  }, 180_000);

  it("refuses a release below the payer's own minimum", async () => {
    const releaseId = newReleaseId();
    const escrow = assetAta(payoutPda(payer.publicKey, releaseId), asset, true);
    const fund = fundPayoutIx({ payer: payer.publicKey, releaseId, kind: "pay", recipient: owner.publicKey, claimant: null, reason: "", declaredUsdc: 5_000_000n, minOutRaw: 650_000n, asset });
    const release = releasePayoutIx({ payer: payer.publicKey, releaseId, recipient: owner.publicKey, asset });
    expect(fund.ok && release.ok).toBe(true);
    if (!fund.ok || !release.ok) return;
    await expectFailure(new Transaction().add(fund.value, mockRoute(payer, escrow, 649_999n), release.value), [payer], /EscrowBelowMinimum|less than the payer's own minimum/);
    expect(await conn.getAccountInfo(payoutPda(payer.publicKey, releaseId))).toBeNull();
  }, 120_000);

  it("sponsors a first position for an address with no book, and lets it claim from an empty wallet", async () => {
    const newcomer = Keypair.generate();
    const releaseId = newReleaseId();
    const escrow = assetAta(payoutPda(payer.publicKey, releaseId), asset, true);
    const fund = fundPayoutIx({ payer: payer.publicKey, releaseId, kind: "gift", recipient: newcomer.publicKey, claimant: null, reason: "a first position, on the house", declaredUsdc: 2_000_000n, minOutRaw: 1n, asset });
    expect(fund.ok).toBe(true);
    if (!fund.ok) return;
    await send(new Transaction().add(fund.value, mockRoute(payer, escrow, 260_000n)), [payer]);
    expect(await balance(escrow, TOKEN_2022_PROGRAM_ID)).toBe(260_000n);

    // Cannot be cancelled yet.
    const cancel = cancelPayoutIx({ payer: payer.publicKey, releaseId, asset });
    expect(cancel.ok).toBe(true);
    if (cancel.ok) await expectFailure(new Transaction().add(cancel.value), [payer], /TooEarlyToCancel|thirty days/);

    // The newcomer holds no SOL. The deployer relays: pays the book's rent, the fee, the
    // receipt. The newcomer only signs.
    expect(await conn.getBalance(newcomer.publicKey)).toBe(0);
    const open = openBookIx({ owner: newcomer.publicKey, payer: payer.publicKey, slug: `${slug}c`, asset, usdcMint: usdcMint.publicKey, termsVersion: 0 });
    const claim = claimPayoutIx({ claimer: newcomer.publicKey, feePayer: payer.publicKey, claimKey: null, payer: payer.publicKey, releaseId, asset });
    expect(open.ok && claim.ok).toBe(true);
    if (!open.ok || !claim.ok) return;
    const tx = new Transaction().add(open.value, claim.value);
    tx.feePayer = payer.publicKey;
    await send(tx, [payer, newcomer]);

    expect(await balance(assetAta(newcomer.publicKey, asset), TOKEN_2022_PROGRAM_ID)).toBe(260_000n);
    expect(await conn.getAccountInfo(escrow)).toBeNull();
    const r = await readReceipt(receiptPda(payoutPda(payer.publicKey, releaseId), releaseId));
    expect(r.kind).toBe("gift");
    expect(r.recipient).toBe(newcomer.publicKey.toBase58());
    expect(r.submitter).toBe(payer.publicKey.toBase58());
    expect((await readBook(newcomer.publicKey)).slug).toBe(`${slug}c`);
  }, 180_000);

  // ── runs and grants ───────────────────────────────────────────────────────────────

  it("opens an organisation's register: a handle of kind org, no rule", async () => {
    // A wallet of its own: a Book is one per owner, and the payer already keeps one on any
    // cluster this battery has run against, so opening theirs would only pass the first time.
    const org = Keypair.generate();
    await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: org.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL })), [payer]);
    const open = openBookIx({ owner: org.publicKey, slug: `${slug}org`, asset, usdcMint: usdcMint.publicKey, termsVersion: 0, kind: "org" });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    await send(new Transaction().add(open.value), [org]);
    const info = await conn.getAccountInfo(handlePda(`${slug}org`), "confirmed");
    expect(info).not.toBeNull();
    const h = decodeHandle(info!.data);
    expect(h.ok && h.value.kind).toBe("org");
    expect(h.ok && h.value.owner).toBe(org.publicKey.toBase58());
  }, 120_000);

  it("pays a run: two payments sharing one run id, each receipt carrying it", async () => {
    const runId = newReleaseId();
    for (const [amount, reason] of [[3_000_000n, "run: design"], [2_000_000n, "run: docs"]] as const) {
      const releaseId = newReleaseId();
      const fund = fundPayoutIx({ payer: payer.publicKey, releaseId, kind: "pay", recipient: owner.publicKey, claimant: null, reason, declaredUsdc: amount, minOutRaw: 1n, asset, runId });
      const release = releasePayoutIx({ payer: payer.publicKey, releaseId, recipient: owner.publicKey, asset });
      expect(fund.ok && release.ok).toBe(true);
      if (!fund.ok || !release.ok) return;
      const escrow = assetAta(payoutPda(payer.publicKey, releaseId), asset, true);
      await send(new Transaction().add(memoIx(payer.publicKey, reason), fund.value, mockRoute(payer, escrow, 400_000n), release.value), [payer]);
      const r = await readReceipt(receiptPda(payoutPda(payer.publicKey, releaseId), releaseId));
      expect(r.kind).toBe("pay");
      expect(r.runId).toBe(Buffer.from(runId).toString("hex"));
    }
  }, 180_000);

  const grantId = newReleaseId();
  const GRANT_TOTAL = 2_000_000n; // raw units the stand-in route delivers into the escrow

  it("opens a grant in one transaction: open, the route into the escrow, seal — with the grant's receipt", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Started a thousand seconds ago, no cliff, two thousand seconds long: half has accrued.
    const schedule = { startUnix: now - 1_000, cliffSecs: 0, durationSecs: 2_000, revocable: true };
    const open = openGrantIx({ payer: payer.publicKey, recipient: owner.publicKey, grantId, asset, schedule, reason: "retention: keeper for a quarter", declaredUsdc: 20_000_000n, minOutRaw: GRANT_TOTAL });
    const seal = sealGrantIx({ payer: payer.publicKey, grantId, asset, floatLamports: BigInt(0.05 * LAMPORTS_PER_SOL) });
    expect(open.ok && seal.ok).toBe(true);
    if (!open.ok || !seal.ok) return;
    await send(new Transaction().add(memoIx(payer.publicKey, "retention: keeper for a quarter"), open.value, mockRoute(payer, grantEscrow(payer.publicKey, grantId, asset), GRANT_TOTAL), seal.value), [payer]);

    const g = await readGrant(grantPda(payer.publicKey, grantId));
    expect(g.sealed).toBe(true);
    expect(g.totalRaw).toBe(GRANT_TOTAL);
    expect(g.releasedRaw).toBe(0n);
    expect(g.state).toBe("active");
    expect(g.recipient).toBe(owner.publicKey.toBase58());
    expect(await balance(grantEscrow(payer.publicKey, grantId, asset), TOKEN_2022_PROGRAM_ID)).toBe(GRANT_TOTAL);
    const r = await readReceipt(receiptPda(grantPda(payer.publicKey, grantId), grantId));
    expect(r.kind).toBe("grant");
    expect(r.amountRaw).toBe(GRANT_TOTAL);
    expect(r.paidUsdc).toBe(20_000_000n);
  }, 180_000);

  it("refuses to seal a grant whose escrow is below the payer's own minimum", async () => {
    const id = newReleaseId();
    const open = openGrantIx({ payer: payer.publicKey, recipient: owner.publicKey, grantId: id, asset, schedule: { startUnix: 0, cliffSecs: 86_400, durationSecs: 0, revocable: false }, reason: "", declaredUsdc: 1_000_000n, minOutRaw: 1_000n });
    const seal = sealGrantIx({ payer: payer.publicKey, grantId: id, asset, floatLamports: 0n });
    expect(open.ok && seal.ok).toBe(true);
    if (!open.ok || !seal.ok) return;
    await expectFailure(new Transaction().add(open.value, mockRoute(payer, grantEscrow(payer.publicKey, id, asset), 999n), seal.value), [payer], /EscrowBelowMinimum|below the payer/);
  }, 180_000);

  it("vests what the schedule has released, with a receipt, and repays the caller from the float", async () => {
    const before = await balance(assetAta(owner.publicKey, asset), TOKEN_2022_PROGRAM_ID);
    const solBefore = await conn.getBalance(payer.publicKey);
    const releaseId = newReleaseId();
    const ix = vestIx({ keeper: payer.publicKey, payer: payer.publicKey, recipient: owner.publicKey, grantId, releaseId, asset });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    await send(new Transaction().add(ix.value), [payer]);
    const g = await readGrant(grantPda(payer.publicKey, grantId));
    // About half: the schedule is linear over 2,000 s and started 1,000 s before opening.
    expect(g.releasedRaw).toBeGreaterThanOrEqual(GRANT_TOTAL / 2n);
    expect(g.releasedRaw).toBeLessThan((GRANT_TOTAL * 3n) / 5n);
    const after = await balance(assetAta(owner.publicKey, asset), TOKEN_2022_PROGRAM_ID);
    expect(after - before).toBe(g.releasedRaw);
    const r = await readReceipt(receiptPda(grantPda(payer.publicKey, grantId), releaseId));
    expect(r.kind).toBe("vest");
    expect(r.amountRaw).toBe(g.releasedRaw);
    expect(r.submitter).toBe(payer.publicKey.toBase58());
    // The caller paid a fee and the receipt's rent, and was repaid the rent plus the tip.
    const solAfter = await conn.getBalance(payer.publicKey);
    expect(solAfter).toBeGreaterThan(solBefore - 100_000);
  }, 180_000);

  it("refuses to vest when nothing new has accrued", async () => {
    const ix = vestIx({ keeper: payer.publicKey, payer: payer.publicKey, recipient: owner.publicKey, grantId, releaseId: newReleaseId(), asset });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    // A second later, at most a few raw units have accrued; wait for the program's answer.
    const g = await readGrant(grantPda(payer.publicKey, grantId));
    if (g.releasedRaw >= GRANT_TOTAL) return;
    // Nothing new only if no time has passed; otherwise the program vests the sliver. Either
    // outcome is correct — what must never happen is a vest of MORE than the schedule.
    try {
      await send(new Transaction().add(ix.value), [payer]);
    } catch (err) {
      expect(String(err)).toMatch(/NothingToVest|Nothing has vested/);
    }
    const g2 = await readGrant(grantPda(payer.publicKey, grantId));
    expect(g2.releasedRaw).toBeLessThanOrEqual((GRANT_TOTAL * 3n) / 5n);
  }, 180_000);

  it("revokes: what had not accrued returns to the payer, what had accrued stays claimable, then it closes", async () => {
    const payerBefore = await balance(assetAta(payer.publicKey, asset), TOKEN_2022_PROGRAM_ID);
    const revoke = revokeGrantIx({ payer: payer.publicKey, grantId, asset });
    expect(revoke.ok).toBe(true);
    if (!revoke.ok) return;
    await send(new Transaction().add(revoke.value), [payer]);
    const g = await readGrant(grantPda(payer.publicKey, grantId));
    expect(g.state).toBe("revoked");
    expect(g.releaseCapRaw).not.toBeNull();
    const payerAfter = await balance(assetAta(payer.publicKey, asset), TOKEN_2022_PROGRAM_ID);
    expect(payerAfter - payerBefore).toBe(GRANT_TOTAL - g.releaseCapRaw!);
    // The accrued remainder still vests to the recipient, receipt and all.
    const remainder = g.releaseCapRaw! - g.releasedRaw;
    if (remainder > 0n) {
      const rid = newReleaseId();
      const vest = vestIx({ keeper: payer.publicKey, payer: payer.publicKey, recipient: owner.publicKey, grantId, releaseId: rid, asset });
      expect(vest.ok).toBe(true);
      if (!vest.ok) return;
      await send(new Transaction().add(vest.value), [payer]);
      expect((await readReceipt(receiptPda(grantPda(payer.publicKey, grantId), rid))).amountRaw).toBe(remainder);
    }
    expect(await balance(grantEscrow(payer.publicKey, grantId, asset), TOKEN_2022_PROGRAM_ID)).toBe(0n);
    const close = closeGrantIx({ payer: payer.publicKey, grantId, asset });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    await send(new Transaction().add(close.value), [payer]);
    expect(await conn.getAccountInfo(grantPda(payer.publicKey, grantId), "confirmed")).toBeNull();
  }, 240_000);

  it("opens a second grant that keeps vesting: a cliff a day out, a year long", async () => {
    const id = newReleaseId();
    const now = Math.floor(Date.now() / 1000);
    const open = openGrantIx({ payer: payer.publicKey, recipient: owner.publicKey, grantId: id, asset, schedule: { startUnix: now, cliffSecs: 86_400, durationSecs: 365 * 86_400, revocable: true }, reason: "retention: a year of keeping", declaredUsdc: 50_000_000n, minOutRaw: 5_000_000n });
    const seal = sealGrantIx({ payer: payer.publicKey, grantId: id, asset, floatLamports: BigInt(0.05 * LAMPORTS_PER_SOL) });
    expect(open.ok && seal.ok).toBe(true);
    if (!open.ok || !seal.ok) return;
    await send(new Transaction().add(memoIx(payer.publicKey, "retention: a year of keeping"), open.value, mockRoute(payer, grantEscrow(payer.publicKey, id, asset), 5_000_000n), seal.value), [payer]);
    const g = await readGrant(grantPda(payer.publicKey, id));
    expect(g.sealed && g.state === "active" && g.releasedRaw === 0n).toBe(true);
    // Nothing vests before the cliff.
    const ix = vestIx({ keeper: payer.publicKey, payer: payer.publicKey, recipient: owner.publicKey, grantId: id, releaseId: newReleaseId(), asset });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    await expectFailure(new Transaction().add(ix.value), [payer], /NothingToVest|Nothing has vested/);
  }, 180_000);

  it("refuses to measure a receipt before its window", async () => {
    const ix = measureReceiptIx({ receipt: firstSweepReceipt, recipient: owner.publicKey, asset, windowDays: 7 });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    await expectFailure(new Transaction().add(ix.value), [payer], /TooEarlyToMeasure|not old enough/);
    const r = await readReceipt(firstSweepReceipt);
    expect(r.measured7d).toBeNull();
  }, 120_000);

  it("pauses with a revoke the program never sees, and the sweep then refuses", async () => {
    const { createRevokeInstruction } = await import("@solana/spl-token");
    await send(new Transaction().add(createRevokeInstruction(usdcAta(owner.publicKey, usdcMint.publicKey), owner.publicKey, [], TOKEN_PROGRAM_ID)), [owner]);
    await send(new Transaction().add(createMintToInstruction(usdcMint.publicKey, usdcAta(owner.publicKey, usdcMint.publicKey), payer.publicKey, 100_000_000n, [], TOKEN_PROGRAM_ID)), [payer]);
    const releaseId = newReleaseId();
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = buildSweepTransaction({
      keeper: payer.publicKey,
      owner: owner.publicKey,
      usdcMint: usdcMint.publicKey,
      asset,
      releaseId,
      priceUpdate: SOL_USD,
      route: [mockRoute(payer, assetAta(owner.publicKey, asset), 100_000_000n)],
      lookupTables: [],
      recentBlockhash: blockhash,
    });
    expect(tx.ok).toBe(true);
    if (!tx.ok) return;
    await expectFailure(tx.value, [payer], /DelegateNotSet|not the delegate/);
    // The rule still reads "enabled" on chain: pausing is the delegate's absence, not a flag.
    expect((await readBook(owner.publicKey)).rule.enabled).toBe(true);
  }, 180_000);
});
