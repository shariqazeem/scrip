import "server-only";

import { ComputeBudgetProgram, type PublicKey, type TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { type Asset, USDC_MINT } from "@/lib/assets/registry";
import { memoIx } from "@/lib/intake/instructions";
import { validateReason } from "@/lib/intake/memo";
import { INTAKE_SLIPPAGE_BPS, quoteIntake } from "@/lib/intake/build";
import { lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { newReleaseId, toHex } from "@/lib/solana/program";
import { type Schedule, grantEscrow, openGrantIx, sealGrantIx, validateSchedule } from "./instructions";

const GRANT_COMPUTE_UNITS = 600_000;

export type BuiltGrant = {
  readonly transactionBase64: string;
  readonly grantId: string;
  readonly escrow: string;
  readonly quote: { readonly amountUsdc: string; readonly outAmountRaw: string; readonly minOutRaw: string; readonly priceImpactPct: string; readonly route: readonly string[]; readonly impliedPrice: number };
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
};

/**
 * ONE TRANSACTION THE PAYER SIGNS: memo, open_grant, the route into the grant's escrow,
 * seal_grant. If the route fills short of the payer's own minimum, `seal_grant` refuses and
 * nothing moves. The float pays for every vest's receipt and tip after that.
 */
export async function buildGrant(input: {
  payer: PublicKey;
  recipient: PublicKey;
  asset: Asset;
  amountUsdc: bigint;
  reason: string;
  schedule: Schedule;
  floatLamports: bigint;
  grantId?: Uint8Array;
  runId?: Uint8Array | null;
}): Promise<Outcome<BuiltGrant>> {
  const reason = validateReason(input.reason);
  if (!reason.ok) return reason;
  const schedule = validateSchedule(input.schedule);
  if (!schedule.ok) return schedule;
  const q = await quoteIntake(input.asset, input.amountUsdc);
  if (!q.ok) return q;

  const grantId = input.grantId ?? newReleaseId();
  const escrow = grantEscrow(input.payer, grantId, input.asset);
  const open = openGrantIx({
    payer: input.payer,
    recipient: input.recipient,
    grantId,
    asset: input.asset,
    schedule: schedule.value,
    reason: reason.value,
    declaredUsdc: input.amountUsdc,
    minOutRaw: BigInt(q.value.minOutRaw),
    runId: input.runId ?? null,
  });
  if (!open.ok) return open;
  const seal = sealGrantIx({ payer: input.payer, grantId, asset: input.asset, floatLamports: input.floatLamports });
  if (!seal.ok) return seal;

  const fresh = await jupQuote({ inputMint: USDC_MINT, outputMint: input.asset.mint, amount: input.amountUsdc, slippageBps: INTAKE_SLIPPAGE_BPS, maxAccounts: 30 });
  if (!fresh.ok) return fresh;
  const swap = await swapInstructions({ quote: fresh.value, userPublicKey: input.payer, destinationTokenAccount: escrow });
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

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: GRANT_COMPUTE_UNITS }),
    ...(reason.value ? [memoIx(input.payer, reason.value)] : []),
    open.value,
    ...swap.value.setup,
    swap.value.swap,
    ...(swap.value.cleanup ? [swap.value.cleanup] : []),
    seal.value,
  ];
  let tx: VersionedTransaction;
  try {
    tx = new VersionedTransaction(new TransactionMessage({ payerKey: input.payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts.value));
  } catch (err) {
    return held(`The grant could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
  const bytes = tx.serialize();
  if (bytes.length > 1232) {
    return held(`This route needs ${bytes.length} bytes and a transaction holds 1232. The route is unavailable right now; try again shortly.`);
  }
  return ok({
    transactionBase64: Buffer.from(bytes).toString("base64"),
    grantId: toHex(grantId),
    escrow: escrow.toBase58(),
    quote: { ...q.value, minOutRaw: fresh.value.otherAmountThreshold, outAmountRaw: fresh.value.outAmount },
    blockhash,
    lastValidBlockHeight,
  });
}
