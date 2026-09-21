import "server-only";

import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  type TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { type Asset, USDC_MINT } from "@/lib/assets/registry";
import { lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { newReleaseId, toHex } from "@/lib/solana/program";
import { escrowAddress, fundPayoutIx, intakeFrame, memoIx } from "./instructions";
import { validateReason } from "./memo";

/**
 * THE INTAKE — a payer's USDC becomes the recipient's asset, in the recipient's own account,
 * with a receipt, in ONE transaction the payer signs.
 *
 *     [compute, memo, fund_payout, jupiter…, release_payout]
 *
 * The payer's protection is their own quote: `min_out_raw` is what Jupiter promised at the
 * slippage they saw, and `release_payout` refuses anything less. A price impact past the
 * bound is refused here, before a wallet opens.
 */
export const INTAKE_SLIPPAGE_BPS = 50;
export const MAX_PRICE_IMPACT_PCT = 1.0;
export const MIN_INTAKE_USDC = 1_000_000n;
export const INTAKE_COMPUTE_UNITS = 500_000;

export type IntakeQuote = {
  readonly amountUsdc: string;
  readonly outAmountRaw: string;
  readonly minOutRaw: string;
  readonly priceImpactPct: string;
  readonly route: readonly string[];
  /** USD per whole unit, implied by the quote. For display. */
  readonly impliedPrice: number;
};

export async function quoteIntake(asset: Asset, amountUsdc: bigint): Promise<Outcome<IntakeQuote>> {
  if (amountUsdc < MIN_INTAKE_USDC) return held("The minimum is $1.");
  const q = await jupQuote({
    inputMint: USDC_MINT,
    outputMint: asset.mint,
    amount: amountUsdc,
    slippageBps: INTAKE_SLIPPAGE_BPS,
    maxAccounts: 30,
  });
  if (!q.ok) return q;
  const impact = Number(q.value.priceImpactPct) * 100;
  if (Number.isFinite(impact) && impact > MAX_PRICE_IMPACT_PCT) {
    return held(`The route would move the price ${impact.toFixed(2)}%. The limit is ${MAX_PRICE_IMPACT_PCT}%; try a smaller amount or later.`);
  }
  const out = BigInt(q.value.outAmount);
  if (out <= 0n) return held("The route returns nothing at this size.");
  const units = Number(out) / 10 ** asset.decimals;
  return ok({
    amountUsdc: amountUsdc.toString(),
    outAmountRaw: q.value.outAmount,
    minOutRaw: q.value.otherAmountThreshold,
    priceImpactPct: q.value.priceImpactPct,
    route: q.value.routePlan.map((r) => r.swapInfo.label ?? r.swapInfo.ammKey.slice(0, 6)),
    impliedPrice: units > 0 ? Number(amountUsdc) / 1e6 / units : 0,
  });
}

export type BuiltIntake = {
  readonly transactionBase64: string;
  readonly releaseId: string;
  readonly escrow: string;
  readonly quote: IntakeQuote;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
};

/**
 * `mode` decides the frame:
 *   pay    the recipient has a register: fund, swap, release — it lands now, with a receipt.
 *   gift   no register: fund and swap into the escrow; it waits for a claim. `claimant` is a
 *          claim key's pubkey for a link with no address, otherwise the recipient's address
 *          is who may claim.
 * `runId` marks every payment of a payroll run, so a run page is derivable from the chain.
 */
export async function buildIntake(input: {
  payer: PublicKey;
  recipient: PublicKey | null;
  claimant?: PublicKey | null;
  asset: Asset;
  amountUsdc: bigint;
  reason: string;
  mode?: "pay" | "gift";
  releaseId?: Uint8Array;
  runId?: Uint8Array | null;
  /** A split: this much USDC goes to the recipient's normal address as cash, in the same transaction. */
  cashUsdc?: bigint;
}): Promise<Outcome<BuiltIntake>> {
  const reason = validateReason(input.reason);
  if (!reason.ok) return reason;
  const q = await quoteIntake(input.asset, input.amountUsdc);
  if (!q.ok) return q;
  const mode = input.mode ?? "pay";
  if (mode === "pay" && !input.recipient) return held("A payment needs a recipient with a register.");

  const releaseId = input.releaseId ?? newReleaseId();
  let frame: Outcome<{ before: TransactionInstruction[]; after: TransactionInstruction[]; escrow: PublicKey }>;
  if (mode === "pay") {
    frame = intakeFrame({
      payer: input.payer,
      releaseId,
      recipient: input.recipient!,
      reason: reason.value,
      declaredUsdc: input.amountUsdc,
      minOutRaw: BigInt(q.value.minOutRaw),
      asset: input.asset,
      runId: input.runId ?? null,
    });
  } else {
    const fund = fundPayoutIx({
      payer: input.payer,
      releaseId,
      kind: "gift",
      runId: input.runId ?? null,
      recipient: input.recipient,
      claimant: input.claimant ?? null,
      reason: reason.value,
      declaredUsdc: input.amountUsdc,
      minOutRaw: BigInt(q.value.minOutRaw),
      asset: input.asset,
    });
    frame = fund.ok
      ? ok({
          before: reason.value ? [memoIx(input.payer, reason.value), fund.value] : [fund.value],
          after: [],
          escrow: escrowAddress(input.payer, releaseId, input.asset),
        })
      : fund;
  }
  if (!frame.ok) return frame;

  // The quote was fetched by quoteIntake; fetch the instructions for THAT quote.
  const fresh = await jupQuote({ inputMint: USDC_MINT, outputMint: input.asset.mint, amount: input.amountUsdc, slippageBps: INTAKE_SLIPPAGE_BPS, maxAccounts: 30 });
  if (!fresh.ok) return fresh;
  const swap = await swapInstructions({ quote: fresh.value, userPublicKey: input.payer, destinationTokenAccount: frame.value.escrow });
  if (!swap.ok) return swap;

  const conn = connection();
  const alts = await lookupTables(conn, swap.value.lookupTableAddresses);
  if (!alts.ok) return alts;
  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }

  const cash: TransactionInstruction[] = [];
  if (input.cashUsdc && input.cashUsdc > 0n && input.recipient) {
    // The cash part: a plain USDC transfer to the recipient's own account, created if absent.
    const usdcMint = new PublicKey(USDC_MINT);
    const from = getAssociatedTokenAddressSync(usdcMint, input.payer, false, TOKEN_PROGRAM_ID);
    const to = getAssociatedTokenAddressSync(usdcMint, input.recipient, false, TOKEN_PROGRAM_ID);
    cash.push(
      createAssociatedTokenAccountIdempotentInstruction(input.payer, to, input.recipient, usdcMint, TOKEN_PROGRAM_ID),
      createTransferCheckedInstruction(from, usdcMint, to, input.payer, input.cashUsdc, 6, [], TOKEN_PROGRAM_ID),
    );
  }
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: INTAKE_COMPUTE_UNITS }),
    ...cash,
    ...frame.value.before,
    ...swap.value.setup,
    swap.value.swap,
    ...(swap.value.cleanup ? [swap.value.cleanup] : []),
    ...frame.value.after,
  ];
  let tx: VersionedTransaction;
  try {
    tx = new VersionedTransaction(
      new TransactionMessage({ payerKey: input.payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts.value),
    );
  } catch (err) {
    return held(`The payment could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
  const bytes = tx.serialize();
  if (bytes.length > 1232) {
    return held(`This route needs ${bytes.length} bytes and a transaction holds 1232. The route is unavailable right now; try again shortly.`);
  }
  return ok({
    transactionBase64: Buffer.from(bytes).toString("base64"),
    releaseId: toHex(releaseId),
    escrow: frame.value.escrow.toBase58(),
    quote: { ...q.value, minOutRaw: fresh.value.otherAmountThreshold, outAmountRaw: fresh.value.outAmount },
    blockhash,
    lastValidBlockHeight,
  });
}
