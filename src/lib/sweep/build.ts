import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  type TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { beginSweepIx, finishSweepIx } from "./instructions";

/**
 * ONE ATOMIC SWEEP.
 *
 *     0  ComputeBudget      unit limit; unit price
 *     1  begin_sweep        the slice leaves the owner's USDC through the delegate
 *     2… the route          Jupiter's setup, swap (destination = the owner's asset account), cleanup
 *     n  finish_sweep       delta ≥ Pyth min-out, receipt, tip — or everything reverts
 *
 * The keeper builds it; a test builds it with a plain transfer standing in for the route.
 * Neither can leave the second half out: `begin_sweep` refuses if it is not there.
 */
export const SWEEP_COMPUTE_UNITS = 600_000;

export function buildSweepTransaction(input: {
  keeper: PublicKey;
  owner: PublicKey;
  usdcMint: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  releaseId: Uint8Array;
  priceUpdate: PublicKey;
  route: readonly TransactionInstruction[];
  trailing?: readonly TransactionInstruction[];
  lookupTables: readonly AddressLookupTableAccount[];
  recentBlockhash: string;
  computeUnits?: number;
  priorityMicroLamports?: number;
}): Outcome<VersionedTransaction> {
  const begin = beginSweepIx(input);
  if (!begin.ok) return begin;
  const finish = finishSweepIx(input);
  if (!finish.ok) return finish;
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: input.computeUnits ?? SWEEP_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: input.priorityMicroLamports ?? 10_000 }),
    begin.value,
    ...input.route,
    finish.value,
    ...(input.trailing ?? []),
  ];
  try {
    const message = new TransactionMessage({ payerKey: input.keeper, recentBlockhash: input.recentBlockhash, instructions: ixs }).compileToV0Message(
      [...input.lookupTables],
    );
    const tx = new VersionedTransaction(message);
    const size = tx.serialize().length;
    if (size > 1232) return held(`The sweep transaction is ${size} bytes; the limit is 1232. Ask Jupiter for fewer accounts or a direct route.`);
    return ok(tx);
  } catch (err) {
    return held(`The sweep could not be compiled (${err instanceof Error ? err.message : String(err)}).`);
  }
}
