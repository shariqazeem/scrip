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
import { cohortPda, goalPda, payoutPda, receiptPda } from "../src/lib/solana/program";

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
        // No goal is skimming. Anchor's convention for an omitted optional account is the
        // program's own id — and getting it wrong does not error, it shifts every leg by one.
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
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
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: coder.encode("release_payout", {}),
    });
    await expect(
      sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" }),
    ).rejects.toThrow();
  }, 300_000);
});

describe.runIf(LIVE)("a sponsored first position on devnet", () => {
  let claimer: Keypair;
  let claimNonce: bigint;
  let claimRelease: Uint8Array;

  beforeAll(async () => {
    payer = loadKeypair(KEY_PATH);
    claimer = Keypair.generate();
    claimNonce = BigInt(Date.now()) + 1n;
    claimRelease = Uint8Array.from(Array.from({ length: 32 }, (_, i) => (i * 11 + Date.now()) % 249));

    // The claimer pays rent for their own receipt, so they need a little SOL. In the product
    // an issuer would airdrop this alongside the sponsorship; here the payer stands in.
    const fund = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: claimer.publicKey,
        lamports: 0.05e9,
      }),
    );
    await withRetry("fund claimer", () =>
      sendAndConfirmTransaction(conn, fund, [payer], { commitment: "confirmed" }),
    );
  }, 300_000);

  it("is funded with NO named recipient, and claimed by whoever turns up", async () => {
    /**
     * The sponsored first position: an issuer funds grams into a book that does not exist
     * yet, and whoever claims it becomes the recipient. Nobody had to decide to become an
     * investor — which is the whole wedge.
     */
    const payout = payoutPda(payer.publicKey, claimNonce);
    const leg = { mint: goldMint.publicKey, amount: 50_000n, program: TOKEN_PROGRAM_ID };

    const fundTx = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(payout, leg.mint, leg.program),
          payout,
          leg.mint,
          leg.program,
        ),
      )
      .add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          // THE DEFAULT PUBKEY IS THE CLAIM PATH. No recipient is named.
          { pubkey: PublicKey.default, isSigner: false, isWritable: false },
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payer.publicKey, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: leg.program, isSigner: false, isWritable: false },
        ],
        data: coder.encode("fund_payout", {
          nonce: new BN(claimNonce.toString()),
          release_id: Array.from(claimRelease),
          value_base: new BN("217450000"),
          grams_e8: new BN("155517384"),
          reason: "a first position, on the house",
          legs: [{ mint: leg.mint, amount: new BN(leg.amount.toString()) }],
        }),
      });
    await withRetry("fund sponsorship", () =>
      sendAndConfirmTransaction(conn, fundTx, [payer], { commitment: "confirmed" }),
    );

    const claimTx = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          claimer.publicKey,
          ata(claimer.publicKey, leg.mint, leg.program),
          claimer.publicKey,
          leg.mint,
          leg.program,
        ),
      )
      .add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: claimer.publicKey, isSigner: true, isWritable: true },
          { pubkey: receiptPda(claimRelease, claimer.publicKey), isSigner: false, isWritable: true },
          { pubkey: cohortPda(claimRelease, claimer.publicKey), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          // No goal: the claimer has not set one.
          { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: ata(claimer.publicKey, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: leg.program, isSigner: false, isWritable: false },
        ],
        data: coder.encode("claim_payout", {}),
      });
    await withRetry("claim", () =>
      sendAndConfirmTransaction(conn, claimTx, [claimer], { commitment: "confirmed" }),
    );

    const held = await withRetry("claimer balance", () =>
      getAccount(conn, ata(claimer.publicKey, leg.mint, leg.program), "confirmed", leg.program),
    );
    expect(held.amount).toBe(leg.amount);

    // The receipt records the CLAIMER as the recipient, decided at claim rather than at
    // funding — and the payer as who paid, which is what makes it a sponsorship.
    const info = await withRetry("claim receipt", () =>
      conn.getAccountInfo(receiptPda(claimRelease, claimer.publicKey), "confirmed"),
    );
    expect(info).toBeTruthy();
    const r = decodeReceipt(info!.data);
    expect(r.recipient).toBe(claimer.publicKey.toBase58());
    expect(r.payer).toBe(payer.publicKey.toBase58());
    expect(r.reason).toBe("a first position, on the house");
  }, 300_000);

  it("cannot be claimed twice by the same wallet, and nothing had to remember", async () => {
    /**
     * One claim per person per campaign, enforced by the ACCOUNT MODEL rather than by a
     * check: the receipt lives at [b"receipt", release_id, recipient], so a second claim
     * tries to create an account that already exists and the runtime refuses it. No ledger of
     * who claimed, nothing to keep in sync, nothing to get wrong.
     */
    const payout = payoutPda(payer.publicKey, claimNonce);
    const tx = new Transaction().add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: claimer.publicKey, isSigner: true, isWritable: true },
        { pubkey: receiptPda(claimRelease, claimer.publicKey), isSigner: false, isWritable: true },
        { pubkey: cohortPda(claimRelease, claimer.publicKey), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: coder.encode("claim_payout", {}),
    });
    await expect(
      sendAndConfirmTransaction(conn, tx, [claimer], { commitment: "confirmed" }),
    ).rejects.toThrow();
  }, 300_000);
});

describe.runIf(LIVE)("a goal vault on devnet", () => {
  const SLUG = `laptop-${Date.now() % 100000}`;
  let stranger: Keypair;

  beforeAll(() => {
    payer = loadKeypair(KEY_PATH);
    stranger = Keypair.generate();
  });

  it("is created, funded, and pays its owner", async () => {
    const goal = goalPda(payer.publicKey, SLUG);

    const setTx = new Transaction().add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: goal, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: coder.encode("set_goal", {
        slug: SLUG,
        name: "A laptop",
        target_base: new BN("1500000000"),
        skim_bps: 1000,
      }),
    });
    await withRetry("set goal", () =>
      sendAndConfirmTransaction(conn, setTx, [payer], { commitment: "confirmed" }),
    );

    // Put something in it, the way an inbound skim would.
    const fundTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata(goal, goldMint.publicKey, TOKEN_PROGRAM_ID),
        goal,
        goldMint.publicKey,
        TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        goldMint.publicKey,
        ata(goal, goldMint.publicKey, TOKEN_PROGRAM_ID),
        payer.publicKey,
        25_000n,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
    await withRetry("fund goal", () =>
      sendAndConfirmTransaction(conn, fundTx, [payer], { commitment: "confirmed" }),
    );

    const before = await withRetry("owner before", () =>
      getAccount(conn, ata(payer.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID), "confirmed"),
    );

    const withdrawTx = new Transaction().add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: goal, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: goldMint.publicKey, isSigner: false, isWritable: false },
        { pubkey: ata(goal, goldMint.publicKey, TOKEN_PROGRAM_ID), isSigner: false, isWritable: true },
        {
          pubkey: ata(payer.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: coder.encode("withdraw_goal", { amounts: [new BN("25000")] }),
    });
    await withRetry("withdraw goal", () =>
      sendAndConfirmTransaction(conn, withdrawTx, [payer], { commitment: "confirmed" }),
    );

    const after = await withRetry("owner after", () =>
      getAccount(conn, ata(payer.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID), "confirmed"),
    );
    expect(after.amount - before.amount).toBe(25_000n);
  }, 300_000);

  it("REFUSES to pay anyone but its owner", async () => {
    /**
     * The guarantee the whole feature rests on, tested against the chain rather than asserted
     * in a comment. A goal has one destination, and there is no branch in the program that
     * could send anywhere else.
     */
    const goal = goalPda(payer.publicKey, SLUG);
    const fundTx = new Transaction().add(
      createMintToInstruction(
        goldMint.publicKey,
        ata(goal, goldMint.publicKey, TOKEN_PROGRAM_ID),
        payer.publicKey,
        5_000n,
        [],
        TOKEN_PROGRAM_ID,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata(stranger.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID),
        stranger.publicKey,
        goldMint.publicKey,
        TOKEN_PROGRAM_ID,
      ),
    );
    await withRetry("refill goal", () =>
      sendAndConfirmTransaction(conn, fundTx, [payer], { commitment: "confirmed" }),
    );

    const tx = new Transaction().add({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: goal, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: goldMint.publicKey, isSigner: false, isWritable: false },
        { pubkey: ata(goal, goldMint.publicKey, TOKEN_PROGRAM_ID), isSigner: false, isWritable: true },
        // A third party, requested by the goal's own owner. Still refused.
        {
          pubkey: ata(stranger.publicKey, goldMint.publicKey, TOKEN_PROGRAM_ID),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: coder.encode("withdraw_goal", { amounts: [new BN("5000")] }),
    });
    await expect(
      sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" }),
    ).rejects.toThrow();
  }, 300_000);
});

describe.runIf(LIVE)("a goal skimming a real payout on devnet", () => {
  const SLUG = `runway-${Date.now() % 100000}`;
  let saver: Keypair;
  let skimNonce: bigint;
  let skimRelease: Uint8Array;

  beforeAll(async () => {
    payer = loadKeypair(KEY_PATH);
    saver = Keypair.generate();
    skimNonce = BigInt(Date.now()) + 2n;
    skimRelease = Uint8Array.from(Array.from({ length: 32 }, (_, i) => (i * 13 + Date.now()) % 247));

    // The saver needs a little SOL to sign for their own goal.
    await withRetry("fund saver", () =>
      sendAndConfirmTransaction(
        conn,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: saver.publicKey,
            lamports: 0.05e9,
          }),
        ),
        [payer],
        { commitment: "confirmed" },
      ),
    );

    // The SAVER sets their own goal. A payer cannot create one for somebody else.
    await withRetry("set saver goal", () =>
      sendAndConfirmTransaction(
        conn,
        new Transaction().add({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: goalPda(saver.publicKey, SLUG), isSigner: false, isWritable: true },
            { pubkey: saver.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: coder.encode("set_goal", {
            slug: SLUG,
            name: "Three months of runway",
            target_base: new BN("9000000000"),
            skim_bps: 2500,
          }),
        }),
        [saver],
        { commitment: "confirmed" },
      ),
    );
  }, 300_000);

  it("takes exactly its share, and the recipient keeps the rest", async () => {
    /**
     * Saving at the moment value arrives. The payer releases 100,000 base units; the saver's
     * goal takes 25% and the saver keeps 75%. Both destinations are checked against the chain
     * afterwards, because "the skim is applied" is a claim about somebody's money.
     */
    const payout = payoutPda(payer.publicKey, skimNonce);
    const goal = goalPda(saver.publicKey, SLUG);
    const leg = { mint: goldMint.publicKey, amount: 100_000n, program: TOKEN_PROGRAM_ID };

    const fundTx = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(payout, leg.mint, leg.program),
          payout,
          leg.mint,
          leg.program,
        ),
      )
      .add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: saver.publicKey, isSigner: false, isWritable: false },
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payer.publicKey, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: leg.program, isSigner: false, isWritable: false },
        ],
        data: coder.encode("fund_payout", {
          nonce: new BN(skimNonce.toString()),
          release_id: Array.from(skimRelease),
          value_base: new BN("434900000"),
          grams_e8: new BN("311034768"),
          reason: "a month of work",
          legs: [{ mint: leg.mint, amount: new BN(leg.amount.toString()) }],
        }),
      });
    await withRetry("fund skim payout", () =>
      sendAndConfirmTransaction(conn, fundTx, [payer], { commitment: "confirmed" }),
    );

    const releaseTx = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(saver.publicKey, leg.mint, leg.program),
          saver.publicKey,
          leg.mint,
          leg.program,
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          ata(goal, leg.mint, leg.program),
          goal,
          leg.mint,
          leg.program,
        ),
      )
      .add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: receiptPda(skimRelease, saver.publicKey), isSigner: false, isWritable: true },
          { pubkey: cohortPda(skimRelease, saver.publicKey), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: goal, isSigner: false, isWritable: true },
          { pubkey: leg.mint, isSigner: false, isWritable: false },
          { pubkey: ata(payout, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: ata(saver.publicKey, leg.mint, leg.program), isSigner: false, isWritable: true },
          { pubkey: leg.program, isSigner: false, isWritable: false },
          { pubkey: ata(goal, leg.mint, leg.program), isSigner: false, isWritable: true },
        ],
        data: coder.encode("release_payout", {}),
      });
    await withRetry("release with skim", () =>
      sendAndConfirmTransaction(conn, releaseTx, [payer], { commitment: "confirmed" }),
    );

    const toSaver = await withRetry("saver balance", () =>
      getAccount(conn, ata(saver.publicKey, leg.mint, leg.program), "confirmed", leg.program),
    );
    const toGoal = await withRetry("goal balance", () =>
      getAccount(conn, ata(goal, leg.mint, leg.program), "confirmed", leg.program),
    );

    expect(toGoal.amount).toBe(25_000n); // 25%
    expect(toSaver.amount).toBe(75_000n);
    // Nothing created, nothing lost.
    expect(toSaver.amount + toGoal.amount).toBe(leg.amount);

    // And the receipt still records the WHOLE arrival — the skim is where the value went,
    // not a reduction in what was received.
    const info = await withRetry("skim receipt", () =>
      conn.getAccountInfo(receiptPda(skimRelease, saver.publicKey), "confirmed"),
    );
    const r = decodeReceipt(info!.data);
    expect(r.legs[0]!.amount).toBe(leg.amount);
    expect(r.valueBase).toBe(434_900_000n);
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
