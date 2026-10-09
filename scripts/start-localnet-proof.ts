/**
 * THE START, PROVEN END TO END ON A LOCAL VALIDATOR — the first payment counted as saving turns
 * on, then the program's own save of it, then the receipt and its attribution.
 *
 *     scripts/localnet.sh start          # the devnet build, Pyth's SOL/USD cloned (fresh for ten minutes)
 *     npx tsx --conditions=react-server scripts/start-localnet-proof.ts
 *     scripts/localnet.sh stop
 *
 * Throwaway keys only, made here and funded by the local validator's airdrop. A six-decimal mint
 * stands in for USDC, a Token-2022 mint for the stock, a transfer from the payer's stash for the
 * route; the price is the cloned Pyth account, checked by the program exactly as on mainnet.
 * What it proves: the start leaves the wallet's USDC where it was, the rule counts the first
 * payment as arriving, `begin_sweep` and `finish_sweep` save exactly the rate of it through the
 * delegate, and the indexer attributes the receipt to the start itself.
 */
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
  getMintLen,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { DEVNET_FEEDS } from "../src/lib/assets/registry";
import { decodeBook, decodeReceipt } from "../src/lib/book/decode";
import { attributeSweep } from "../src/lib/ledger/attribute";
import { parsePriceAccount } from "../src/lib/pyth/price";
import { minOutRaw } from "../src/lib/rule/min-out";
import { USDC_ACCOUNT_BYTES, assetAta, enableRuleIxs, openBookIx, usdcAta } from "../src/lib/rule/instructions";
import { computeSlice } from "../src/lib/rule/slice";
import { bookPda, newReleaseId, receiptPda } from "../src/lib/solana/program";
import { firstPaymentHands, holdingSeed, startInstructions } from "../src/lib/start/instructions";
import { buildSweepTransaction } from "../src/lib/sweep/build";
import { sendAndConfirm } from "@/lib/solana/confirm";
import { makeConnection } from "@/lib/solana/make-connection";

const RPC = process.env.LOCALNET_RPC || "http://127.0.0.1:8899";
const conn = makeConnection(RPC);
const SOL_USD = new PublicKey(DEVNET_FEEDS.raw.account);
const PAID = 50_000_000n; // the wallet was paid $50
const FIRST = 10_100_000n; // and starts with $10.10 of it
const RATE_BPS = 1_000;

const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) process.exitCode = 1;
};
const bal = async (ata: PublicKey, program: PublicKey) => (await getAccount(conn, ata, "confirmed", program)).amount;

async function main() {
  if (!RPC.includes("127.0.0.1") && !RPC.includes("localhost")) throw new Error("this proof runs on a local validator only");
  const payer = Keypair.generate();
  const owner = Keypair.generate();
  for (const k of [payer, owner]) {
    const sig = await conn.requestAirdrop(k.publicKey, (k === payer ? 20 : 1) * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }

  // The mints, the payer's stash of the stock, and the owner's $50 payment.
  const usdcMint = Keypair.generate();
  const assetMint = Keypair.generate();
  const asset = { mint: assetMint.publicKey.toBase58(), program: "token-2022" as const, decimals: 8 };
  const plainLen = getMintLen([]);
  const scaledLen = getMintLen([ExtensionType.ScaledUiAmountConfig]);
  await sendAndConfirm(
    conn,
    new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdcMint.publicKey, space: plainLen, lamports: await conn.getMinimumBalanceForRentExemption(plainLen), programId: TOKEN_PROGRAM_ID }),
      createInitializeMintInstruction(usdcMint.publicKey, 6, payer.publicKey, null, TOKEN_PROGRAM_ID),
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: assetMint.publicKey, space: scaledLen, lamports: await conn.getMinimumBalanceForRentExemption(scaledLen), programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeScaledUiAmountConfigInstruction(assetMint.publicKey, payer.publicKey, 1, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(assetMint.publicKey, 8, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
    ),
    [payer, usdcMint, assetMint],
  );
  const ownerUsdc = usdcAta(owner.publicKey, usdcMint.publicKey);
  await sendAndConfirm(
    conn,
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ownerUsdc, owner.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
      createMintToInstruction(usdcMint.publicKey, ownerUsdc, payer.publicKey, PAID, [], TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, usdcAta(payer.publicKey, usdcMint.publicKey), payer.publicKey, usdcMint.publicKey, TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, assetMint.publicKey, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(assetMint.publicKey, assetAta(payer.publicKey, asset), payer.publicKey, 100_000_000_000n, [], TOKEN_2022_PROGRAM_ID),
    ),
    [payer],
  );
  console.log(`a wallet paid $${Number(PAID) / 1e6}: ${owner.publicKey.toBase58()}`);

  // ── the start, exactly as lib/start/build.ts assembles it ───────────────────────────────
  const open = openBookIx({ owner: owner.publicKey, slug: `proof${Date.now().toString(36).slice(-6)}`, asset, usdcMint: usdcMint.publicKey, termsVersion: 0 });
  const rule = enableRuleIxs({
    owner: owner.publicKey,
    usdcMint: usdcMint.publicKey,
    terms: { rateBps: RATE_BPS, escalateBps: 0, floorUsdc: 0n, capUsdc: 5_000_000_000n, toleranceBps: 100 },
    allowanceUsdc: 200_000_000n,
    floatLamports: 20_000_000n,
  });
  if (!open.ok || !rule.ok) throw new Error("could not build the start");
  const hands = await firstPaymentHands({ owner: owner.publicKey, usdcMint: usdcMint.publicKey, basisUsdc: FIRST, seed: holdingSeed(), rentLamports: await conn.getMinimumBalanceForRentExemption(USDC_ACCOUNT_BYTES) });
  const ixs = startInstructions({ owner: owner.publicKey, open: [open.value], rule: rule.value, joins: [], hands });
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const startTx = new VersionedTransaction(
    new TransactionMessage({ payerKey: owner.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message(),
  );
  startTx.sign([owner]);
  const startSig = await conn.sendTransaction(startTx);
  await conn.confirmTransaction(startSig, "confirmed");
  console.log(`started: ${startSig} (${startTx.serialize().length} bytes)`);

  const book = decodeBook((await conn.getAccountInfo(bookPda(owner.publicKey), "confirmed"))!.data);
  if (!book.ok) throw new Error(book.why);
  const after = await bal(ownerUsdc, TOKEN_PROGRAM_ID);
  check(after === PAID, `the wallet still holds $${Number(after) / 1e6} of USDC`);
  check(book.value.rule.enabled && book.value.rule.watermark === PAID - FIRST, `the rule is on, its watermark $${Number(book.value.rule.watermark) / 1e6}`);
  check((await conn.getAccountInfo(hands.holding, "confirmed")) === null, "the holding account is closed");

  // ── the save, as Scrip's servers send it ─────────────────────────────────────────────────
  const slice = computeSlice({ balance: after, watermark: book.value.rule.watermark, minInbound: book.value.rule.minInbound, cap: book.value.rule.capUsdc, floor: book.value.rule.floorUsdc, rateBps: book.value.rule.rateBps });
  if (!slice.ok) throw new Error(slice.why);
  check(slice.value.slice === (FIRST * BigInt(RATE_BPS)) / 10_000n, `the program would save $${Number(slice.value.slice) / 1e6} of the $${Number(FIRST) / 1e6}`);
  const priceInfo = await conn.getAccountInfo(SOL_USD, "confirmed");
  const price = parsePriceAccount(priceInfo!.data);
  if (!price.ok) throw new Error(price.why);
  const min = minOutRaw({ sliceUsdc: slice.value.slice, toleranceBps: 100, price: price.value.price, conf: price.value.conf, expo: price.value.expo, assetDecimals: 8, multiplierE12: null });
  if (!min.ok) throw new Error(min.why);
  const releaseId = newReleaseId();
  const ownerAsset = assetAta(owner.publicKey, asset);
  const swept = buildSweepTransaction({
    keeper: payer.publicKey,
    owner: owner.publicKey,
    usdcMint: usdcMint.publicKey,
    asset,
    releaseId,
    priceUpdate: SOL_USD,
    route: [createTransferCheckedInstruction(assetAta(payer.publicKey, asset), assetMint.publicKey, ownerAsset, payer.publicKey, min.value + min.value / 200n, 8, [], TOKEN_2022_PROGRAM_ID)],
    lookupTables: [],
    recentBlockhash: (await conn.getLatestBlockhash("confirmed")).blockhash,
  });
  if (!swept.ok) throw new Error(swept.why);
  swept.value.sign([payer]);
  const sweepSig = await conn.sendTransaction(swept.value);
  await conn.confirmTransaction(sweepSig, "confirmed");
  console.log(`saved: ${sweepSig}`);

  const receiptAddr = receiptPda(bookPda(owner.publicKey), releaseId);
  const receipt = decodeReceipt((await conn.getAccountInfo(receiptAddr, "confirmed"))!.data);
  if (!receipt.ok) throw new Error(receipt.why);
  check(receipt.value.basisUsdc === FIRST && receipt.value.paidUsdc === slice.value.slice, `the receipt: $${Number(receipt.value.basisUsdc) / 1e6} counted, $${Number(receipt.value.paidUsdc) / 1e6} saved`);
  check((await bal(ownerUsdc, TOKEN_PROGRAM_ID)) === PAID - slice.value.slice, "the wallet's USDC fell by exactly the slice");
  check((await bal(ownerAsset, TOKEN_2022_PROGRAM_ID)) >= min.value, "the stock arrived in the same wallet, at least the Pyth-bounded minimum");

  // ── what the receipt page will say about where the money came from ─────────────────────
  const slot = BigInt((await conn.getTransaction(sweepSig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }))!.slot);
  const who = await attributeSweep(conn, owner.publicKey.toBase58(), slot, receipt.value.basisUsdc, usdcMint.publicKey.toBase58());
  check(who.ok && who.value.length === 1 && who.value[0]!.start === true && who.value[0]!.sig === startSig, "the receipt is attributed to the start itself");
  console.log(process.exitCode ? "\nFAILED" : "\nthe start, proven end to end");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
