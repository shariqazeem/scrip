import "server-only";

import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { type Asset, USDC_MINT } from "@/lib/assets/registry";
import { memoIx } from "@/lib/intake/instructions";
import { INTAKE_MICRO_LAMPORTS, INTAKE_SLIPPAGE_BPS, quoteIntake } from "@/lib/intake/build";
import { validateReason } from "@/lib/intake/memo";
import { simulateFirst } from "@/lib/intake/preflight";
import { lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { newReleaseId, toHex } from "@/lib/solana/program";
import { type PlanTerms, addMemberIx, openPlanIx, planEscrow, planPda, validateTerms } from "./instructions";

/**
 * OPENING A PLAN — one transaction the sponsor signs:
 *
 *     [compute, memo (the plan's name), open_plan, jupiter… (USDC → the plan's stock, into the escrow)]
 *
 * The route's own minimum protects the sponsor: a fill short of the quote they saw fails the
 * transaction and nothing moves. Invites go in a second transaction, a handful per signature,
 * so a long list never crowds the route out of the size limit.
 */
const OPEN_COMPUTE_UNITS = 600_000;
/** Each `add_member` is five accounts and an account's rent; ten fit comfortably in one transaction. */
export const INVITES_PER_TX = 10;

export type BuiltPlan = {
  readonly transactionBase64: string;
  readonly planId: string;
  readonly plan: string;
  readonly escrow: string;
  readonly quote: { readonly outAmountRaw: string; readonly minOutRaw: string; readonly route: readonly string[] };
  readonly lastValidBlockHeight: number;
};

export async function buildOpenPlan(input: { sponsor: PublicKey; asset: Asset; budgetUsdc: bigint; terms: PlanTerms; name: string }): Promise<Outcome<BuiltPlan>> {
  const name = validateReason(input.name);
  if (!name.ok) return name;
  if (!name.value) return held("Give the Plan a name people will recognise.");
  const bad = validateTerms(input.terms);
  if (bad) return held(bad);
  const q = await quoteIntake(input.asset, input.budgetUsdc);
  if (!q.ok) return q;

  const planId = newReleaseId();
  const open = openPlanIx({ sponsor: input.sponsor, planId, asset: input.asset, terms: input.terms, reason: name.value });
  if (!open.ok) return open;
  const escrow = planEscrow(input.sponsor, planId, input.asset);
  const fresh = await jupQuote({ inputMint: USDC_MINT, outputMint: input.asset.mint, amount: input.budgetUsdc, slippageBps: INTAKE_SLIPPAGE_BPS, maxAccounts: 30 });
  if (!fresh.ok) return fresh;
  const swap = await swapInstructions({ quote: fresh.value, userPublicKey: input.sponsor, destinationTokenAccount: escrow });
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
    ComputeBudgetProgram.setComputeUnitLimit({ units: OPEN_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: INTAKE_MICRO_LAMPORTS }),
    memoIx(input.sponsor, name.value),
    open.value,
    ...swap.value.setup,
    swap.value.swap,
    ...(swap.value.cleanup ? [swap.value.cleanup] : []),
  ];
  let tx: VersionedTransaction;
  try {
    tx = new VersionedTransaction(new TransactionMessage({ payerKey: input.sponsor, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts.value));
  } catch (err) {
    return held(`The Plan could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
  const bytes = tx.serialize();
  if (bytes.length > 1232) return held("The route is too long for one transaction right now. Try again in a moment.");
  const refusal = await simulateFirst(conn as never, tx);
  if (refusal) return held(refusal.kind === "usdc" ? "This wallet holds less USDC than the budget. Nothing was signed." : `Opening the Plan would fail right now (${refusal.detail}). Nothing was signed.`);
  return ok({
    transactionBase64: Buffer.from(bytes).toString("base64"),
    planId: toHex(planId),
    plan: planPda(input.sponsor, planId).toBase58(),
    escrow: escrow.toBase58(),
    quote: { outAmountRaw: fresh.value.outAmount, minOutRaw: fresh.value.otherAmountThreshold, route: q.value.route },
    lastValidBlockHeight,
  });
}

/** Up to ten invites in one transaction the sponsor signs. */
export async function buildInvites(input: { sponsor: PublicKey; plan: PublicKey; owners: readonly PublicKey[] }): Promise<Outcome<{ transactionBase64: string; lastValidBlockHeight: number }>> {
  if (input.owners.length === 0) return held("Name at least one person.");
  if (input.owners.length > INVITES_PER_TX) return held(`At most ${INVITES_PER_TX} people per signature; send the rest next.`);
  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: INTAKE_MICRO_LAMPORTS })];
  for (const owner of input.owners) {
    const ix = addMemberIx({ sponsor: input.sponsor, plan: input.plan, owner });
    if (!ix.ok) return ix;
    ixs.push(ix.value);
  }
  const conn = connection();
  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: input.sponsor, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
    return ok({ transactionBase64: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight });
  } catch (err) {
    return held(`The invites could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
}

export function parseOwners(raw: string): Outcome<PublicKey[]> {
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const out: PublicKey[] = [];
  for (const p of parts) {
    try {
      const k = new PublicKey(p);
      if (!PublicKey.isOnCurve(k.toBytes())) return held(`${p.slice(0, 8)}… is a program address, not a person's wallet.`);
      if (!out.some((o) => o.equals(k))) out.push(k);
    } catch {
      return held(`${p.slice(0, 12)} is not a Solana address.`);
    }
  }
  return ok(out);
}

/**
 * ONE INSTRUCTION, ONE SIGNATURE — joining, removing a member, closing a Plan. Simulated before
 * the wallet is asked, so a refusal reads as a sentence here instead of a wallet error there.
 */
export async function buildSingle(input: { signer: PublicKey; ix: TransactionInstruction; what: string }): Promise<Outcome<{ transactionBase64: string; lastValidBlockHeight: number }>> {
  const conn = connection();
  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: input.signer,
        recentBlockhash: blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: INTAKE_MICRO_LAMPORTS }), input.ix],
      }).compileToV0Message(),
    );
    const refusal = await simulateFirst(conn as never, tx);
    if (refusal) return held(`${input.what} would fail right now (${refusal.detail}). Nothing was signed.`);
    return ok({ transactionBase64: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight });
  } catch (err) {
    return held(`${input.what} could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
}
