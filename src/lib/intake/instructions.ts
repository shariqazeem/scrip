import { BN } from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { assetAta, tokenProgramFor } from "@/lib/rule/instructions";
import { bookPda, buildIx, payoutPda, receiptPda } from "@/lib/solana/program";
import { MAX_REASON_LEN, MEMO_PROGRAM_ID, reasonHash } from "./memo";

/**
 * THE INTAKE INSTRUCTIONS — fund, release, claim, cancel — and the measurement crank.
 *
 * An intake is one transaction the PAYER signs:
 *
 *     [compute, memo, fund_payout, jupiter…, release_payout]
 *
 * `fund_payout` creates the escrow; the swap fills it; `release_payout` checks the payer's
 * own minimum, moves the escrow into the recipient's account, writes the receipt and closes
 * the escrow. The program never CPIs Jupiter, and the transaction is atomic without it.
 */

/** A payment to someone with a register lands now ("pay"); one to an empty wallet waits to be claimed ("gift"). */
export type PayoutKind = "pay" | "gift";

export function memoIx(payer: PublicKey, reason: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(reason, "utf8"),
  });
}

export function fundPayoutIx(input: {
  payer: PublicKey;
  releaseId: Uint8Array;
  kind: PayoutKind;
  recipient: PublicKey | null;
  claimant: PublicKey | null;
  reason: string;
  declaredUsdc: bigint;
  minOutRaw: bigint;
  asset: Pick<Asset, "mint" | "program">;
  /** The payroll run this payment belongs to; absent for a single payment. */
  runId?: Uint8Array | null;
}): Outcome<TransactionInstruction> {
  if (input.declaredUsdc <= 0n) return held("There is nothing to pay.");
  if (input.reason.length > MAX_REASON_LEN) return held(`A reason can have at most ${MAX_REASON_LEN} characters.`);
  if (input.kind === "pay" && !input.recipient) return held("A payment needs a recipient.");
  if (input.kind === "gift" && !input.recipient && !input.claimant) {
    return held("A gift needs an address or a claim key.");
  }
  if (input.runId && input.runId.length !== 16) return held("A run id is sixteen bytes.");
  const payout = payoutPda(input.payer, input.releaseId);
  return buildIx(
    "fund_payout",
    {
      release_id: Array.from(input.releaseId),
      // The coder wants the variant spelled as the IDL spells it.
      kind: input.kind === "pay" ? { Settle: {} } : { Sponsor: {} },
      recipient: input.recipient ?? PublicKey.default,
      claimant: input.claimant ?? PublicKey.default,
      reason_hash: Array.from(reasonHash(input.reason)),
      declared_usdc: new BN(input.declaredUsdc.toString()),
      min_out_raw: new BN(input.minOutRaw.toString()),
      run_id: Array.from(input.runId ?? new Uint8Array(16)),
    },
    {
      payer: input.payer,
      payout,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(payout, input.asset, true),
      recipient_book: input.kind === "pay" && input.recipient ? bookPda(input.recipient) : undefined,
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

/** Where the swap must land: the escrow, owned by the Payout PDA. */
export function escrowAddress(payer: PublicKey, releaseId: Uint8Array, asset: Pick<Asset, "mint" | "program">): PublicKey {
  return assetAta(payoutPda(payer, releaseId), asset, true);
}

export function releasePayoutIx(input: {
  payer: PublicKey;
  releaseId: Uint8Array;
  recipient: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  priceUpdate?: PublicKey;
}): Outcome<TransactionInstruction> {
  const payout = payoutPda(input.payer, input.releaseId);
  return buildIx(
    "release_payout",
    {},
    {
      payer: input.payer,
      payout,
      recipient: input.recipient,
      recipient_book: bookPda(input.recipient),
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(payout, input.asset, true),
      recipient_asset: assetAta(input.recipient, input.asset),
      price_update: input.priceUpdate,
      receipt: receiptPda(payout, input.releaseId),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

export function claimPayoutIx(input: {
  claimer: PublicKey;
  feePayer: PublicKey;
  claimKey: PublicKey | null;
  payer: PublicKey;
  releaseId: Uint8Array;
  asset: Pick<Asset, "mint" | "program">;
  priceUpdate?: PublicKey;
}): Outcome<TransactionInstruction> {
  const payout = payoutPda(input.payer, input.releaseId);
  return buildIx(
    "claim_payout",
    {},
    {
      claimer: input.claimer,
      fee_payer: input.feePayer,
      claim_key: input.claimKey ?? undefined,
      payout,
      payer: input.payer,
      claimer_book: bookPda(input.claimer),
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(payout, input.asset, true),
      claimer_asset: assetAta(input.claimer, input.asset),
      price_update: input.priceUpdate,
      receipt: receiptPda(payout, input.releaseId),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

export function cancelPayoutIx(input: {
  payer: PublicKey;
  releaseId: Uint8Array;
  asset: Pick<Asset, "mint" | "program">;
}): Outcome<TransactionInstruction> {
  const payout = payoutPda(input.payer, input.releaseId);
  return buildIx(
    "cancel_payout",
    {},
    {
      payer: input.payer,
      payout,
      asset_mint: new PublicKey(input.asset.mint),
      escrow: assetAta(payout, input.asset, true),
      payer_asset: assetAta(input.payer, input.asset),
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    },
  );
}

/** Anyone may call it. The answer comes from the recipient's own token account. */
export function measureReceiptIx(input: {
  receipt: PublicKey;
  recipient: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  windowDays: 7 | 30;
}): Outcome<TransactionInstruction> {
  if (input.windowDays !== 7 && input.windowDays !== 30) return held("The window is 7 or 30 days.");
  return buildIx(
    "measure_receipt",
    { window_days: input.windowDays },
    {
      receipt: input.receipt,
      recipient_asset: assetAta(input.recipient, input.asset),
      asset_mint: new PublicKey(input.asset.mint),
      asset_token_program: tokenProgramFor(input.asset),
    },
  );
}

/** The full intake, minus the swap: the caller splices Jupiter's instructions in the gap. */
export function intakeFrame(input: {
  payer: PublicKey;
  releaseId: Uint8Array;
  recipient: PublicKey;
  reason: string;
  declaredUsdc: bigint;
  minOutRaw: bigint;
  asset: Pick<Asset, "mint" | "program">;
  priceUpdate?: PublicKey;
  runId?: Uint8Array | null;
}): Outcome<{ before: TransactionInstruction[]; after: TransactionInstruction[]; escrow: PublicKey }> {
  const fund = fundPayoutIx({
    payer: input.payer,
    releaseId: input.releaseId,
    kind: "pay",
    runId: input.runId ?? null,
    recipient: input.recipient,
    claimant: null,
    reason: input.reason,
    declaredUsdc: input.declaredUsdc,
    minOutRaw: input.minOutRaw,
    asset: input.asset,
  });
  if (!fund.ok) return fund;
  const release = releasePayoutIx({
    payer: input.payer,
    releaseId: input.releaseId,
    recipient: input.recipient,
    asset: input.asset,
    priceUpdate: input.priceUpdate,
  });
  if (!release.ok) return release;
  const before: TransactionInstruction[] = [];
  if (input.reason.length > 0) before.push(memoIx(input.payer, input.reason));
  before.push(fund.value);
  return ok({ before, after: [release.value], escrow: escrowAddress(input.payer, input.releaseId, input.asset) });
}
