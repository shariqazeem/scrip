import { BN } from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { MAX_REASON_LEN, reasonHash } from "@/lib/intake/memo";
import { type Outcome, held, ok } from "@/lib/outcome";
import { assetAta, tokenProgramFor } from "@/lib/rule/instructions";
import { buildIx, grantPda, receiptPda } from "@/lib/solana/program";

/**
 * GRANTS — stock bought now that vests on a schedule, from anyone to anyone.
 *
 * Opening one is a single transaction the PAYER signs:
 *
 *     [compute, memo, open_grant, jupiter…, seal_grant]
 *
 * `open_grant` creates the Grant and its escrow (and the recipient's own account if they
 * have none); the route fills the escrow; `seal_grant` checks the payer's own minimum, fixes
 * the total, deposits the float and writes the grant's receipt. Vesting is anyone's call.
 */

/** Ten years, as the program has it. */
export const MAX_GRANT_SECS = 10 * 365 * 86_400;
/** Enough float for a year of monthly vests at 0.0034 SOL each, and change. */
export const SUGGESTED_GRANT_FLOAT_LAMPORTS = 50_000_000n;

export type Schedule = {
  /** Unix seconds; 0 means "now", set by the program. */
  readonly startUnix: number;
  readonly cliffSecs: number;
  /** Linear after the cliff; 0 = everything at the cliff. */
  readonly durationSecs: number;
  readonly revocable: boolean;
};

export function validateSchedule(s: Schedule): Outcome<Schedule> {
  if (!Number.isInteger(s.cliffSecs) || s.cliffSecs < 0) return held("The cliff must be a whole number of seconds.");
  if (!Number.isInteger(s.durationSecs) || s.durationSecs < 0) return held("The duration must be a whole number of seconds.");
  if (s.cliffSecs + s.durationSecs > MAX_GRANT_SECS) return held("A grant's cliff plus duration must be within ten years.");
  if (s.cliffSecs + s.durationSecs === 0) return held("A grant needs a cliff or a duration; otherwise it is a payment.");
  if (!Number.isInteger(s.startUnix) || s.startUnix < 0) return held("The start must be a Unix time, or 0 for now.");
  return ok(s);
}

export function grantEscrow(payer: PublicKey, grantId: Uint8Array, asset: Pick<Asset, "mint" | "program">): PublicKey {
  return assetAta(grantPda(payer, grantId), asset, true);
}

export function openGrantIx(input: {
  payer: PublicKey;
  recipient: PublicKey;
  grantId: Uint8Array;
  asset: Pick<Asset, "mint" | "program">;
  schedule: Schedule;
  reason: string;
  declaredUsdc: bigint;
  minOutRaw: bigint;
  runId?: Uint8Array | null;
}): Outcome<TransactionInstruction> {
  if (input.declaredUsdc <= 0n) return held("There is nothing to grant.");
  if (input.reason.length > MAX_REASON_LEN) return held(`A reason can have at most ${MAX_REASON_LEN} characters.`);
  if (input.grantId.length !== 16) return held("A grant id is sixteen bytes.");
  if (input.runId && input.runId.length !== 16) return held("A run id is sixteen bytes.");
  const schedule = validateSchedule(input.schedule);
  if (!schedule.ok) return schedule;
  const grant = grantPda(input.payer, input.grantId);
  return buildIx(
    "open_grant",
    {
      grant_id: Array.from(input.grantId),
      start_unix: new BN(input.schedule.startUnix),
      cliff_secs: input.schedule.cliffSecs,
      duration_secs: input.schedule.durationSecs,
      revocable: input.schedule.revocable,
      reason_hash: Array.from(reasonHash(input.reason)),
      declared_usdc: new BN(input.declaredUsdc.toString()),
      min_out_raw: new BN(input.minOutRaw.toString()),
      run_id: Array.from(input.runId ?? new Uint8Array(16)),
    },
    {
      payer: input.payer,
      recipient: input.recipient,
      grant,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(grant, input.asset, true),
      recipient_asset: assetAta(input.recipient, input.asset),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

export function sealGrantIx(input: { payer: PublicKey; grantId: Uint8Array; asset: Pick<Asset, "mint" | "program">; floatLamports: bigint }): Outcome<TransactionInstruction> {
  if (input.floatLamports < 0n) return held("The float cannot be negative.");
  const grant = grantPda(input.payer, input.grantId);
  return buildIx(
    "seal_grant",
    { float_lamports: new BN(input.floatLamports.toString()) },
    {
      payer: input.payer,
      grant,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(grant, input.asset, true),
      receipt: receiptPda(grant, input.grantId),
      asset_token_program: tokenProgramFor(input.asset),
      system_program: SystemProgram.programId,
    },
  );
}

/** Anyone may vest what the schedule has released; the caller is repaid from the float. */
export function vestIx(input: { keeper: PublicKey; payer: PublicKey; recipient: PublicKey; grantId: Uint8Array; releaseId: Uint8Array; asset: Pick<Asset, "mint" | "program"> }): Outcome<TransactionInstruction> {
  if (input.releaseId.length !== 16) return held("A release id is sixteen bytes.");
  const grant = grantPda(input.payer, input.grantId);
  return buildIx(
    "vest",
    { release_id: Array.from(input.releaseId) },
    {
      keeper: input.keeper,
      grant,
      recipient: input.recipient,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(grant, input.asset, true),
      recipient_asset: assetAta(input.recipient, input.asset),
      receipt: receiptPda(grant, input.releaseId),
      asset_token_program: tokenProgramFor(input.asset),
      system_program: SystemProgram.programId,
    },
  );
}

function payerSide(name: "revoke_grant" | "close_grant", input: { payer: PublicKey; grantId: Uint8Array; asset: Pick<Asset, "mint" | "program"> }): Outcome<TransactionInstruction> {
  const grant = grantPda(input.payer, input.grantId);
  return buildIx(
    name,
    {},
    {
      payer: input.payer,
      grant,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(grant, input.asset, true),
      payer_asset: assetAta(input.payer, input.asset),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

/** What had not accrued returns to the payer; what had accrued stays claimable. */
export function revokeGrantIx(input: { payer: PublicKey; grantId: Uint8Array; asset: Pick<Asset, "mint" | "program"> }): Outcome<TransactionInstruction> {
  return payerSide("revoke_grant", input);
}

/** A finished grant: rent and remaining float back to the payer. */
export function closeGrantIx(input: { payer: PublicKey; grantId: Uint8Array; asset: Pick<Asset, "mint" | "program"> }): Outcome<TransactionInstruction> {
  return payerSide("close_grant", input);
}
