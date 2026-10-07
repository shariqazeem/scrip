import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { MAX_REASON_LEN, reasonHash } from "@/lib/intake/memo";
import { type Outcome, held } from "@/lib/outcome";
import { assetAta, tokenProgramFor } from "@/lib/rule/instructions";
import { SCRIP_PROGRAM_ID, buildIx } from "@/lib/solana/program";

/**
 * PLANS — a sponsor's match for the people they pay, enforced by the program.
 *
 *   open      [memo, open_plan, jupiter… (destination = the escrow)]       the sponsor signs
 *   invite    [add_member × n]                                            the sponsor signs
 *   join      [enable_rule (or start), accept_member]                      the member signs
 *   match     [match_receipt]                          anyone, after each of a member's sweeps
 *   close     [remove_member × n, close_plan]                              the sponsor signs
 *
 * There is no instruction to fund a Plan: the escrow is an ordinary token account owned by the
 * Plan, so the route in the opening transaction delivers into it directly and a top-up is a
 * plain transfer. A match never exceeds the share, the member's monthly cap or the escrow, and
 * is priced at Pyth's price plus its band, so the sponsor never pays more than the dollars.
 */

/** 30 days, as the program counts a member's month. */
export const MATCH_PERIOD_SECONDS = 30 * 86_400;
export const MAX_MATCH_BPS = 10_000;

export function planPda(sponsor: PublicKey, planId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("plan"), sponsor.toBuffer(), Buffer.from(planId)], SCRIP_PROGRAM_ID)[0];
}

export function memberPda(plan: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("member"), plan.toBuffer(), owner.toBuffer()], SCRIP_PROGRAM_ID)[0];
}

export function planEscrow(sponsor: PublicKey, planId: Uint8Array, asset: Pick<Asset, "mint" | "program">): PublicKey {
  return assetAta(planPda(sponsor, planId), asset, true);
}

export type PlanTerms = {
  readonly matchBps: number;
  readonly monthlyCapUsdc: bigint;
  readonly defaultRateBps: number;
  readonly escalateBps: number;
};

export function validateTerms(t: PlanTerms): string | null {
  if (!Number.isInteger(t.matchBps) || t.matchBps <= 0 || t.matchBps > MAX_MATCH_BPS) return "A match is between 0.01% and 100% of what each person saves.";
  if (t.monthlyCapUsdc <= 0n) return "Set a monthly cap per person above zero.";
  if (t.defaultRateBps < 0 || t.defaultRateBps > 5_000 || t.escalateBps < 0 || t.escalateBps > 5_000) return "The suggested rate must be between 0% and 50%.";
  return null;
}

export function openPlanIx(input: { sponsor: PublicKey; planId: Uint8Array; asset: Pick<Asset, "mint" | "program">; terms: PlanTerms; reason: string }): Outcome<TransactionInstruction> {
  if (input.planId.length !== 16) return held("A plan id is sixteen bytes.");
  if (input.reason.length > MAX_REASON_LEN) return held(`A plan's name can have at most ${MAX_REASON_LEN} characters.`);
  const bad = validateTerms(input.terms);
  if (bad) return held(bad);
  const plan = planPda(input.sponsor, input.planId);
  return buildIx(
    "open_plan",
    {
      plan_id: Array.from(input.planId),
      match_bps: input.terms.matchBps,
      monthly_cap_usdc: new BN(input.terms.monthlyCapUsdc.toString()),
      default_rate_bps: input.terms.defaultRateBps,
      escalate_bps: input.terms.escalateBps,
      reason_hash: Array.from(reasonHash(input.reason)),
    },
    {
      sponsor: input.sponsor,
      plan,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(plan, input.asset, true),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

export function addMemberIx(input: { sponsor: PublicKey; plan: PublicKey; owner: PublicKey }): Outcome<TransactionInstruction> {
  return buildIx("add_member", {}, { sponsor: input.sponsor, plan: input.plan, owner: input.owner, member: memberPda(input.plan, input.owner), system_program: SystemProgram.programId });
}

export function acceptMemberIx(input: { owner: PublicKey; plan: PublicKey }): Outcome<TransactionInstruction> {
  return buildIx("accept_member", {}, { owner: input.owner, plan: input.plan, member: memberPda(input.plan, input.owner) });
}

export function removeMemberIx(input: { sponsor: PublicKey; plan: PublicKey; owner: PublicKey }): Outcome<TransactionInstruction> {
  return buildIx("remove_member", {}, { sponsor: input.sponsor, plan: input.plan, member: memberPda(input.plan, input.owner) });
}

/** Anyone may match an active member's sweep receipt, with a fresh Pyth price for the Plan's stock. */
export function matchReceiptIx(input: {
  caller: PublicKey;
  plan: PublicKey;
  owner: PublicKey;
  receipt: PublicKey;
  priceUpdate: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
}): Outcome<TransactionInstruction> {
  return buildIx(
    "match_receipt",
    {},
    {
      caller: input.caller,
      plan: input.plan,
      member: memberPda(input.plan, input.owner),
      owner: input.owner,
      receipt: input.receipt,
      price_update: input.priceUpdate,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(input.plan, input.asset, true),
      owner_asset: assetAta(input.owner, input.asset),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

export function closePlanIx(input: { sponsor: PublicKey; planId: Uint8Array; asset: Pick<Asset, "mint" | "program"> }): Outcome<TransactionInstruction> {
  const plan = planPda(input.sponsor, input.planId);
  return buildIx(
    "close_plan",
    {},
    {
      sponsor: input.sponsor,
      plan,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(plan, input.asset, true),
      sponsor_asset: assetAta(input.sponsor, input.asset),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

/** The match the program would pay, mirrored for a screen: share, month, escrow, smallest wins. */
export function previewMatchUsdc(sliceUsdc: bigint, matchBps: number, monthlyCapUsdc: bigint, matchedThisPeriod: bigint): bigint {
  const want = (sliceUsdc * BigInt(Math.min(matchBps, MAX_MATCH_BPS))) / 10_000n;
  const room = monthlyCapUsdc > matchedThisPeriod ? monthlyCapUsdc - matchedThisPeriod : 0n;
  return want < room ? want : room;
}
