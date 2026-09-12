/**
 * @vitest-environment node
 *
 * THE ONE TEST THAT PROVES THE PROGRAM WORKS.
 *
 * Every other test in this repo checks arithmetic, encoding, or a rule in isolation. This one
 * takes two mints that do not exist yet, a recipient who has never held anything, and a payer
 * with nothing but SOL, and runs a real payout through a real deployed program on devnet:
 * escrow, release, receipt, cohort. Then it reads the accounts back and compares them to what
 * the client believed it was sending.
 *
 * It deliberately uses TWO TOKEN PROGRAMS — a classic SPL mint standing in for Oro GOLD and a
 * Token-2022 mint with a ScaledUiAmount multiplier standing in for SPYx — because the
 * product's own default mix straddles both, and a test with one program would prove the
 * program can pay half a mix.
 *
 *     npm run test:devnet
 *
 * Gated on a flag and on a funded deploy key. It spends devnet SOL and takes a minute; the
 * ordinary suite stays offline and instant.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BN, BorshInstructionCoder } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createMintToInstruction,
  getAccount,
  getMintLen,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import idlJson from "../src/lib/anchor/webgold.json";
import { cohortPda, payoutPda, receiptPda } from "../src/lib/solana/program";

const LIVE = process.env.DEVNET_E2E === "1";
const RPC = process.env.DEVNET_RPC || "https://api.devnet.solana.com";
const KEY_PATH =
  process.env.DEVNET_KEYPAIR || join(process.cwd(), "anchor", ".keys", "deployer.json");

const PROGRAM_ID = new PublicKey((idlJson as { address: string }).address);
const coder = new BorshInstructionCoder(idlJson as Idl);

const conn = new Connection(RPC, "confirmed");

/** Both legs of a realistic mix, with the amounts the client will claim it is sending. */
const GOLD_DECIMALS = 6;
const EQUITY_DECIMALS = 8;
const GOLD_AMOUNT = 160_000n; // 0.16 "ounces"
const EQUITY_AMOUNT = 38_970_000n; // 0.3897 "shares"
const VALUE_BASE = 995_839_000n; // $995.839
const GRAMS_E8 = 497_655_628n; // 4.97655628 g
const REASON = "shipped the receipt page on Tuesday";

let payer: Keypair;
let recipient: Keypair;
let goldMint: Keypair;
let equityMint: Keypair;
let releaseId: Uint8Array;
let nonce: bigint;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

function ata(owner: PublicKey, mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  )[0];
}

/** Retry around the public devnet endpoint, which rate-limits hard and transiently. */
async function withRetry<T>(what: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`${what}: ${last instanceof Error ? last.message : String(last)}`);
}

describe.runIf(LIVE)("a real payout on devnet", () => {
  beforeAll(async () => {
    payer = loadKeypair(KEY_PATH);
    recipient = Keypair.generate();
    goldMint = Keypair.generate();
    equityMint = Keypair.generate();
    releaseId = Uint8Array.from(
      Array.from({ length: 32 }, (_, i) => (i * 7 + Date.now()) % 251),
    );
    nonce = BigInt(Date.now());

    const balance = await withRetry("balance", () => conn.getBalance(payer.publicKey));
    expect(balance, "the deploy key needs devnet SOL to run this").toBeGreaterThan(0.2e9);

    // ── a classic SPL mint, standing in for Oro GOLD ────────────────────────
    const goldRent = await withRetry("rent", () => conn.getMinimumBalanceForRentExemption(82));
    const goldTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: goldMint.publicKey,
        lamports: goldRent,
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        goldMint.publicKey,
        GOLD_DECIMALS,
        payer.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    );
    await withRetry("create gold mint", () =>
      sendAndConfirmTransaction(conn, goldTx, [payer, goldMint], { commitment: "confirmed" }),
    );

    // ── a Token-2022 mint WITH a ScaledUiAmount multiplier, standing in for SPYx ──
    const len = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const equityRent = await withRetry("rent2022", () =>
      conn.getMinimumBalanceForRentExemption(len),
    );
    const equityTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: equityMint.publicKey,
        lamports: equityRent,
        space: len,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeScaledUiAmountConfigInstruction(
        equityMint.publicKey,
        payer.publicKey,
        1.005714560286254, // the live SPYx multiplier, read off mainnet
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        equityMint.publicKey,
        EQUITY_DECIMALS,
        payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await withRetry("create equity mint", () =>
      sendAndConfirmTransaction(conn, equityTx, [payer, equityMint], { commitment: "confirmed" }),
    );

    // ── fund the payer with both ────────────────────────────────────────────
    const fundTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata(payer.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID),
        payer.publicKey,
        goldMint.publicKey,
        TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        goldMint.publicKey,
        ata(payer.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID),
        payer.publicKey,
        GOLD_AMOUNT * 10n,
        [],
        TOKEN_PROGRAM_ID,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata(payer.publicKey, equityMint.publicKey, TOKEN_2022_PROGRAM_ID),
        payer.publicKey,
        equityMint.publicKey,
        TOKEN_2022_PROGRAM_ID,
      ),
      createMintToInstruction(
        equityMint.publicKey,
        ata(payer.publicKey, equityMint.publicKey, TOKEN_2022_PROGRAM_ID),
        payer.publicKey,
        EQUITY_AMOUNT * 10n,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await withRetry("mint to payer", () =>
      sendAndConfirmTransaction(conn, fundTx, [payer], { commitment: "confirmed" }),
    );
  }, 300_000);

  it("escrows a two-leg payout across BOTH token programs", async () => {
    const payout = payoutPda(payer.publicKey, nonce);
    const legs = [
      { mint: goldMint.publicKey, amount: GOLD_AMOUNT, program: TOKEN_PROGRAM_ID },
      { mint: equityMint.publicKey, amount: EQUITY_AMOUNT, program: TOKEN_2022_PROGRAM_ID },
    ];

    const tx = new Transaction();
    for (const leg of legs) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(payout, leg.mint, leg.program),
          payout,
          leg.mint,
          leg.program,
        ),
      );
    }
    tx.add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: recipient.publicKey, isSigner: false, isWritable: false },
        ...legs.flatMap((leg) => [
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payer.publicKey, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: leg.program, isSigner: false, isWritable: false },
        ]),
      ],
      data: coder.encode("fund_payout", {
        nonce: new BN(nonce.toString()),
        release_id: Array.from(releaseId),
        value_base: new BN(VALUE_BASE.toString()),
        grams_e8: new BN(GRAMS_E8.toString()),
        reason: REASON,
        legs: legs.map((l) => ({ mint: l.mint, amount: new BN(l.amount.toString()) })),
      }),
    });

    await withRetry("fund", () =>
      sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" }),
    );

    // The escrow holds both legs, and the program holds them — not the payer.
    for (const leg of legs) {
      const escrow = await withRetry("escrow balance", () =>
        getAccount(conn, ata(payout, leg.mint, leg.program), "confirmed", leg.program),
      );
      expect(escrow.amount).toBe(leg.amount);
      expect(escrow.owner.equals(payout)).toBe(true);
    }
  }, 300_000);

  it("releases to the recipient and writes the receipt and the cohort", async () => {
    const payout = payoutPda(payer.publicKey, nonce);
    const receipt = receiptPda(releaseId, recipient.publicKey);
    const cohort = cohortPda(releaseId, recipient.publicKey);
    const legs = [
      { mint: goldMint.publicKey, amount: GOLD_AMOUNT, program: TOKEN_PROGRAM_ID },
      { mint: equityMint.publicKey, amount: EQUITY_AMOUNT, program: TOKEN_2022_PROGRAM_ID },
    ];

    const tx = new Transaction();
    for (const leg of legs) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(recipient.publicKey, leg.mint, leg.program),
          recipient.publicKey,
          leg.mint,
          leg.program,
        ),
      );
    }
    tx.add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: receipt, isSigner: false, isWritable: true },
        { pubkey: cohort, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ...legs.flatMap((leg) => [
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          {
            pubkey: ata(recipient.publicKey, leg.mint, leg.program),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: leg.program, isSigner: false, isWritable: false },
        ]),
      ],
      data: coder.encode("release_payout", {}),
    });

    const signature = await withRetry("release", () =>
      sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" }),
    );
    // eslint-disable-next-line no-console
    console.log(`  released: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // ── the recipient actually holds it, in their own accounts ──────────────
    for (const leg of legs) {
      const held = await withRetry("recipient balance", () =>
        getAccount(conn, ata(recipient.publicKey, leg.mint, leg.program), "confirmed", leg.program),
      );
      expect(held.amount).toBe(leg.amount);
      expect(held.owner.equals(recipient.publicKey)).toBe(true);
    }

    // ── the receipt says what the client believed it was sending ────────────
    const info = await withRetry("receipt", () => conn.getAccountInfo(receipt, "confirmed"));
    expect(info, "no receipt account was created").toBeTruthy();
    const r = decodeReceipt(info!.data);
    expect(r.payer).toBe(payer.publicKey.toBase58());
    expect(r.recipient).toBe(recipient.publicKey.toBase58());
    expect(r.valueBase).toBe(VALUE_BASE);
    // The silent-zero bug, caught end to end: a camelCase field name would put 0 here.
    expect(r.gramsE8).toBe(GRAMS_E8);
    expect(r.reason).toBe(REASON);
    expect(r.legs.map((l) => l.amount)).toEqual([GOLD_AMOUNT, EQUITY_AMOUNT]);

    // ── the cohort's denominator was stamped by the program, at release ─────
    const cohortInfo = await withRetry("cohort", () => conn.getAccountInfo(cohort, "confirmed"));
    expect(cohortInfo, "no cohort account was created").toBeTruthy();
    const view = new DataView(
      cohortInfo!.data.buffer,
      cohortInfo!.data.byteOffset,
      cohortInfo!.data.byteLength,
    );
    expect(view.getBigUint64(8 + 32 + 32, true)).toBe(VALUE_BASE);
  }, 300_000);

  it("refuses to release the same payout twice", async () => {
    // Once a receipt exists somebody has been told they were paid, and there is no instruction
    // that can take that back — nor one that can pay them the same escrow again.
    const payout = payoutPda(payer.publicKey, nonce);
    const tx = new Transaction().add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: receiptPda(releaseId, recipient.publicKey), isSigner: false, isWritable: true },
        { pubkey: cohortPda(releaseId, recipient.publicKey), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: coder.encode("release_payout", {}),
    });
    await expect(
      sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" }),
    ).rejects.toThrow();
  }, 300_000);
});

function decodeReceipt(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const payerKey = new PublicKey(data.slice(o, o + 32)).toBase58();
  o += 32;
  const recipientKey = new PublicKey(data.slice(o, o + 32)).toBase58();
  o += 32;
  o += 32; // release_id
  const valueBase = view.getBigUint64(o, true);
  o += 8;
  const gramsE8 = view.getBigUint64(o, true);
  o += 8;
  const reasonLen = view.getUint32(o, true);
  o += 4;
  const reason = new TextDecoder().decode(data.slice(o, o + reasonLen));
  o += reasonLen;
  o += 8; // at
  o += 1; // bump
  const legCount = view.getUint32(o, true);
  o += 4;
  const legs: Array<{ mint: string; amount: bigint }> = [];
  for (let i = 0; i < legCount; i += 1) {
    const mint = new PublicKey(data.slice(o, o + 32)).toBase58();
    o += 32;
    legs.push({ mint, amount: view.getBigUint64(o, true) });
    o += 8;
  }
  return { payer: payerKey, recipient: recipientKey, valueBase, gramsE8, reason, legs };
}
