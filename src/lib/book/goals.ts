import { BN, BorshInstructionCoder } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { MAX_SLUG_LEN, WEBGOLD_IDL, WEBGOLD_PROGRAM_ID, goalPda } from "@/lib/solana/program";
import { ataFor, tokenProgramFor } from "./payout-instructions";

/**
 * GOAL VAULTS, CLIENT SIDE.
 *
 * A goal is a named target that skims a share of every inbound payout. It can spend in
 * exactly one direction — to its owner — and the program has no branch that could send
 * anywhere else. Nothing here can widen that, and nothing here should look like it could.
 */

const coder = new BorshInstructionCoder(WEBGOLD_IDL as Idl);

/** Mirrors `MAX_SKIM_BPS`. A goal that takes everything is not saving, it is redirection. */
export const MAX_SKIM_BPS = 5_000;
export const MAX_GOAL_NAME_LEN = 64;

export type GoalDraft = {
  readonly slug: string;
  readonly name: string;
  readonly targetBase: bigint;
  readonly skimBps: number;
};

/**
 * A slug from a name. It is a PDA seed, so it must be short, stable and byte-safe — and it is
 * derived from what the owner typed rather than generated, so the same goal named twice is
 * the same goal rather than two.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN);
  return slug;
}

export function validateGoal(draft: GoalDraft): Outcome<GoalDraft> {
  const bytes = new TextEncoder().encode(draft.slug).length;
  if (bytes === 0) return held("Give this goal a name.");
  if (bytes > MAX_SLUG_LEN) {
    return held(`That name is too long to address a goal by — keep it under ${MAX_SLUG_LEN} characters.`);
  }
  if (draft.name.length === 0 || draft.name.length > MAX_GOAL_NAME_LEN) {
    return held(`A goal's name must be 1 to ${MAX_GOAL_NAME_LEN} characters.`);
  }
  if (!Number.isInteger(draft.skimBps) || draft.skimBps < 0 || draft.skimBps > MAX_SKIM_BPS) {
    return held(`A goal cannot take more than ${MAX_SKIM_BPS / 100}% of an inbound payout.`);
  }
  if (draft.targetBase < 0n) return held("A target cannot be negative.");
  return ok(draft);
}

export function setGoalIx(owner: PublicKey, draft: GoalDraft): Outcome<TransactionInstruction> {
  const valid = validateGoal(draft);
  if (!valid.ok) return valid;
  return ok(
    new TransactionInstruction({
      programId: WEBGOLD_PROGRAM_ID,
      keys: [
        { pubkey: goalPda(owner, draft.slug), isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      // snake_case, because Anchor's coder encodes ZERO for a field name it cannot find —
      // a goal that silently skims 0% would look exactly like one that works.
      data: coder.encode("set_goal", {
        slug: draft.slug,
        name: draft.name,
        target_base: new BN(draft.targetBase.toString()),
        skim_bps: draft.skimBps,
      }),
    }),
  );
}

/**
 * Move what a goal holds to its owner. The destination is not a parameter: it is derived from
 * the owner, and the program checks it again.
 */
export function withdrawGoalIx(
  owner: PublicKey,
  slug: string,
  legs: ReadonlyArray<{ asset: Asset; amount: bigint }>,
): Outcome<TransactionInstruction> {
  if (legs.length === 0) return held("This goal holds nothing to withdraw.");
  const goal = goalPda(owner, slug);
  return ok(
    new TransactionInstruction({
      programId: WEBGOLD_PROGRAM_ID,
      keys: [
        { pubkey: goal, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
        ...legs.flatMap((leg) => [
          { pubkey: new PublicKey(leg.asset.mint), isSigner: false, isWritable: false },
          { pubkey: ataFor(goal, leg.asset), isSigner: false, isWritable: true },
          { pubkey: ataFor(owner, leg.asset), isSigner: false, isWritable: true },
          { pubkey: tokenProgramFor(leg.asset), isSigner: false, isWritable: false },
        ]),
      ],
      data: coder.encode("withdraw_goal", {
        amounts: legs.map((l) => new BN(l.amount.toString())),
      }),
    }),
  );
}

export type GoalView = {
  readonly address: string;
  readonly slug: string;
  readonly name: string;
  readonly targetBase: bigint;
  readonly skimBps: number;
  readonly updatedAt: number;
};

/** Decode a `Goal` account, in the program's own field order. */
export function decodeGoal(data: Uint8Array): Outcome<Omit<GoalView, "address">> {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8;
    o += 32; // owner
    o += 1; // bump
    const slugLen = view.getUint32(o, true);
    o += 4;
    if (slugLen > MAX_SLUG_LEN) return held("A goal's slug is longer than the program allows.");
    const slug = new TextDecoder().decode(data.slice(o, o + slugLen));
    o += slugLen;
    const nameLen = view.getUint32(o, true);
    o += 4;
    if (nameLen > MAX_GOAL_NAME_LEN) return held("A goal's name is longer than the program allows.");
    const name = new TextDecoder().decode(data.slice(o, o + nameLen));
    o += nameLen;
    const targetBase = view.getBigUint64(o, true);
    o += 8;
    const skimBps = view.getUint16(o, true);
    o += 2;
    const updatedAt = Number(view.getBigInt64(o, true));
    return ok({ slug, name, targetBase, skimBps, updatedAt });
  } catch {
    return held("A goal account could not be decoded.");
  }
}
