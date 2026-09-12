import { BN, BorshInstructionCoder } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { sha256 } from "@noble/hashes/sha2";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { Allocation } from "@/lib/allocator";
import { type Asset, assetByMint } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import {
  WEBGOLD_IDL,
  WEBGOLD_PROGRAM_ID,
  cohortPda,
  payoutPda,
  receiptPda,
} from "@/lib/solana/program";

/**
 * ESCROW, RELEASE, CANCEL — built client-side, signed by the payer, and nothing else.
 *
 * Encoded from the committed IDL, like every other instruction here, so the layout has one
 * definition and a program change that was never synced fails loudly rather than producing a
 * transaction the program rejects.
 *
 * THE FOUR ACCOUNTS PER LEG, in this order: [mint, source, destination, token program]. The
 * program is per leg because the product's own default mix straddles both — Oro GOLD is a
 * classic SPL mint and SPYx is Token-2022 — so a builder that named one program could only
 * ever pay half a mix.
 */

const coder = new BorshInstructionCoder(WEBGOLD_IDL as Idl);

export const MAX_REASON_LEN = 200;

export function tokenProgramFor(asset: Asset): PublicKey {
  return asset.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export function ataFor(owner: PublicKey, asset: Asset, allowOwnerOffCurve = false): PublicKey {
  // The token program is part of the derivation: a Token-2022 mint's ATA sits at a different
  // address from a classic one's, and deriving both the same way silently finds nothing.
  void allowOwnerOffCurve;
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramFor(asset).toBuffer(), new PublicKey(asset.mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/**
 * A release id from any label. Deterministic, so every payout in one campaign shares it and a
 * cohort is a query rather than a join.
 */
export function releaseIdFrom(label: string): Uint8Array {
  return sha256(new TextEncoder().encode(`webgold:release:${label}`));
}

/** A nonce that will not collide for one payer. 53 bits of randomness is plenty. */
export function newNonce(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

function legAccounts(
  allocation: Allocation,
  from: (asset: Asset) => PublicKey,
  to: (asset: Asset) => PublicKey,
  goal?: PublicKey,
) {
  return allocation.legs.flatMap((leg) => [
    { pubkey: new PublicKey(leg.asset.mint), isSigner: false, isWritable: false },
    { pubkey: from(leg.asset), isSigner: false, isWritable: true },
    { pubkey: to(leg.asset), isSigner: false, isWritable: true },
    { pubkey: tokenProgramFor(leg.asset), isSigner: false, isWritable: false },
    // The fifth slot exists only when a goal is skimming. The program reads the stride from
    // whether the optional goal account is present, so these two must agree or every leg is
    // read one account out of step.
    ...(goal ? [{ pubkey: ataFor(goal, leg.asset), isSigner: false, isWritable: true }] : []),
  ]);
}

/** The recipient's goal, when one is taking a share of what arrives. */
export type SkimmingGoal = { readonly address: string; readonly skimBps: number };

export type FundedPayout = {
  readonly instructions: readonly TransactionInstruction[];
  readonly payout: PublicKey;
  readonly nonce: bigint;
  readonly releaseId: Uint8Array;
};

/**
 * Escrow a payout. The escrow's own token accounts are created here, idempotently, because
 * the program will not create an account it does not hold the rule for — and because a second
 * payout to the same recipient must not fail on an account that already exists.
 */
export function fundPayoutIxs(args: {
  payer: PublicKey;
  recipient: PublicKey;
  allocation: Allocation;
  reason: string;
  releaseId: Uint8Array;
  nonce?: bigint;
}): Outcome<FundedPayout> {
  const { payer, recipient, allocation, reason, releaseId } = args;
  if (allocation.legs.length === 0) return held("There is nothing to escrow.");
  if (reason.length > MAX_REASON_LEN) {
    return held(`That reason is ${reason.length} characters; the limit is ${MAX_REASON_LEN}.`);
  }
  if (releaseId.length !== 32) return held("A release id must be 32 bytes.");

  const nonce = args.nonce ?? newNonce();
  const payout = payoutPda(payer, nonce);

  // `allowOwnerOffCurve` is implicit: the payout PDA is off-curve, which is exactly what makes
  // the escrow un-spendable by anybody without the program.
  const creates = allocation.legs.map((leg) =>
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ataFor(payout, leg.asset),
      payout,
      new PublicKey(leg.asset.mint),
      tokenProgramFor(leg.asset),
    ),
  );

  // snake_case, because Anchor's coder matches the IDL's own field names and encodes ZERO
  // for one it cannot find. `valueBase` and `gramsE8` read naturally and would have put a
  // $0, 0-gram payout on chain with the right legs attached — see instructions.ts.
  const data = coder.encode("fund_payout", {
    nonce: new BN(nonce.toString()),
    release_id: Array.from(releaseId),
    value_base: new BN(allocation.valueBase.toString()),
    grams_e8: new BN(allocation.gramsE8.toString()),
    reason,
    legs: allocation.legs.map((l) => ({
      mint: new PublicKey(l.asset.mint),
      amount: new BN(l.amount.toString()),
    })),
  });

  const ix = new TransactionInstruction({
    programId: WEBGOLD_PROGRAM_ID,
    keys: [
      { pubkey: payout, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: recipient, isSigner: false, isWritable: false },
      ...legAccounts(
        allocation,
        (asset) => ataFor(payer, asset),
        (asset) => ataFor(payout, asset),
      ),
    ],
    data,
  });

  return ok({ instructions: [...creates, ix], payout, nonce, releaseId });
}

/**
 * Release an escrow to its recipient and write the receipt and the cohort.
 *
 * The recipient's token accounts are created here too, by the PAYER, so a recipient who has
 * never held the asset does not have to do anything at all to be paid. That is the product:
 * value arrives, and nobody had to decide to become an investor first.
 */
export function releasePayoutIxs(args: {
  payer: PublicKey;
  recipient: PublicKey;
  allocation: Allocation;
  nonce: bigint;
  releaseId: Uint8Array;
  /** The RECIPIENT's goal, when one is taking a share. Omitted means they keep everything. */
  goal?: SkimmingGoal | null;
}): Outcome<{ instructions: readonly TransactionInstruction[]; receipt: PublicKey }> {
  const { payer, recipient, allocation, nonce, releaseId, goal } = args;
  if (releaseId.length !== 32) return held("A release id must be 32 bytes.");
  const payout = payoutPda(payer, nonce);
  const receipt = receiptPda(releaseId, recipient);

  let goalKey: PublicKey | undefined;
  if (goal) {
    try {
      goalKey = new PublicKey(goal.address);
    } catch {
      return held("That goal's address could not be read.");
    }
  }

  // Both destinations' token accounts, created by the PAYER. A recipient who has never held
  // the asset does not have to do anything at all to be paid, and neither does their goal.
  const creates = allocation.legs.flatMap((leg) => [
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ataFor(recipient, leg.asset),
      recipient,
      new PublicKey(leg.asset.mint),
      tokenProgramFor(leg.asset),
    ),
    ...(goalKey
      ? [
          createAssociatedTokenAccountIdempotentInstruction(
            payer,
            ataFor(goalKey, leg.asset),
            goalKey,
            new PublicKey(leg.asset.mint),
            tokenProgramFor(leg.asset),
          ),
        ]
      : []),
  ]);

  const ix = new TransactionInstruction({
    programId: WEBGOLD_PROGRAM_ID,
    keys: [
      { pubkey: payout, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: cohortPda(releaseId, recipient), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // Anchor's convention for an omitted optional account is the program's own id.
      { pubkey: goalKey ?? WEBGOLD_PROGRAM_ID, isSigner: false, isWritable: Boolean(goalKey) },
      ...legAccounts(
        allocation,
        (asset) => ataFor(payout, asset),
        (asset) => ataFor(recipient, asset),
        goalKey,
      ),
    ],
    data: coder.encode("release_payout", {}),
  });

  return ok({ instructions: [...creates, ix], receipt });
}

/** Return an unreleased escrow to the payer. Only while unreleased — the program enforces it. */
export function cancelPayoutIx(args: {
  payer: PublicKey;
  allocation: Allocation;
  nonce: bigint;
}): TransactionInstruction {
  const { payer, allocation, nonce } = args;
  const payout = payoutPda(payer, nonce);
  return new TransactionInstruction({
    programId: WEBGOLD_PROGRAM_ID,
    keys: [
      { pubkey: payout, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      ...legAccounts(
        allocation,
        (asset) => ataFor(payout, asset),
        (asset) => ataFor(payer, asset),
      ),
    ],
    data: coder.encode("cancel_payout", {}),
  });
}

/**
 * Claim a sponsored first position. The CLAIMER signs, and becomes the recipient.
 *
 * They pay rent for their own receipt, which is a few thousandths of a SOL and is what keeps
 * a sponsor from being drained by account-creation spam. One claim per wallet per campaign is
 * enforced by the account model rather than by a check: the receipt lives at
 * [b"receipt", release_id, claimer], so a second attempt tries to create an account that
 * already exists and the runtime refuses it.
 */
export function claimPayoutIxs(args: {
  claimer: PublicKey;
  sponsor: PublicKey;
  nonce: bigint;
  releaseId: Uint8Array;
  legs: ReadonlyArray<{ mint: string; program: "spl-token" | "token-2022" }>;
  goal?: SkimmingGoal | null;
}): Outcome<{ instructions: readonly TransactionInstruction[]; receipt: PublicKey }> {
  const { claimer, sponsor, nonce, releaseId, legs, goal } = args;
  if (releaseId.length !== 32) return held("A release id must be 32 bytes.");
  if (legs.length === 0) return held("This position holds nothing to claim.");

  const payout = payoutPda(sponsor, nonce);
  const receipt = receiptPda(releaseId, claimer);

  let goalKey: PublicKey | undefined;
  if (goal) {
    try {
      goalKey = new PublicKey(goal.address);
    } catch {
      return held("That goal's address could not be read.");
    }
  }

  const resolved = legs.map((l) => {
    const asset = assetByMint(l.mint);
    return { mint: new PublicKey(l.mint), asset, program: l.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
  });

  const ataOf = (owner: PublicKey, mint: PublicKey, program: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [owner.toBuffer(), program.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0];

  const creates = resolved.flatMap((l) => [
    createAssociatedTokenAccountIdempotentInstruction(
      claimer,
      ataOf(claimer, l.mint, l.program),
      claimer,
      l.mint,
      l.program,
    ),
    ...(goalKey
      ? [
          createAssociatedTokenAccountIdempotentInstruction(
            claimer,
            ataOf(goalKey, l.mint, l.program),
            goalKey,
            l.mint,
            l.program,
          ),
        ]
      : []),
  ]);

  const ix = new TransactionInstruction({
    programId: WEBGOLD_PROGRAM_ID,
    keys: [
      { pubkey: payout, isSigner: false, isWritable: true },
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: cohortPda(releaseId, claimer), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: goalKey ?? WEBGOLD_PROGRAM_ID, isSigner: false, isWritable: Boolean(goalKey) },
      ...resolved.flatMap((l) => [
        { pubkey: l.mint, isSigner: false, isWritable: false },
        { pubkey: ataOf(payout, l.mint, l.program), isSigner: false, isWritable: true },
        { pubkey: ataOf(claimer, l.mint, l.program), isSigner: false, isWritable: true },
        { pubkey: l.program, isSigner: false, isWritable: false },
        ...(goalKey
          ? [{ pubkey: ataOf(goalKey, l.mint, l.program), isSigner: false, isWritable: true }]
          : []),
      ]),
    ],
    data: coder.encode("claim_payout", {}),
  });

  return ok({ instructions: [...creates, ix], receipt });
}
