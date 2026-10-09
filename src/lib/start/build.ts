import "server-only";

import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { loadBook, usdcMintFor } from "@/lib/book/read-book";
import { sol } from "@/lib/format";
import { nameFromAddress } from "@/lib/handle";
import { readSimulation } from "@/lib/intake/preflight";
import { type Outcome, held, ok } from "@/lib/outcome";
import { acceptMemberIx } from "@/lib/plan/instructions";
import { membershipsOf } from "@/lib/plan/read";
import { USDC_ACCOUNT_BYTES, enableRuleIxs, openBookIx, openUsdcIfMissing } from "@/lib/rule/instructions";
import { DEFAULT_ALLOWANCE_USDC, DEFAULT_CAP_USDC, DEFAULT_MIN_INBOUND, DEFAULT_TOLERANCE_BPS, MIN_SLICE, SUGGESTED_FLOAT_LAMPORTS, validateRule } from "@/lib/rule/slice";
import { connection } from "@/lib/solana/connection";
import { rentFor } from "@/lib/solana/rent";
import { FIRST_SLICE_MAX_USDC, sliceOf } from "./first";
import { type FirstHands, firstPaymentHands, holdingSeed, startInstructions } from "./instructions";

/**
 * START — THE ONE FLOW. Every payment turned on, the first payment saved by the rule itself,
 * and every Plan this wallet was invited to joined, in ONE transaction the saver signs once:
 *
 *     [compute, memo, set the first payment aside,
 *      open the USDC account if missing, open_book, approve, prepay, enable_rule,
 *      hand the payment back, accept_member…]
 *
 * Until 9 October the start made a first save with a plain Jupiter swap, and the rule then
 * waited for the next payment, so a new saver never saw the one thing Scrip does that a swap
 * does not. Now the first payment goes through the rule (`./instructions.ts`, `./first.ts`):
 * seconds after the approval, Scrip's servers save its slice through the delegate, at a
 * Pyth-bounded price, onto a receipt the program writes — exactly as every payment after it.
 *
 * Everything else is the defaults the rule page already used: a $200 limit, prepaid saves, no
 * floor, a $5,000 cap per payment, and a name made from the address.
 */

const RULE_MICRO_LAMPORTS = 100_000;
const SIMULATE_UNITS = 1_400_000;
/** The least compute a start asks for, so the wallet's own checks always fit beside it. */
const MIN_UNITS = 200_000;
const BASE_FEE_LAMPORTS = 5_000;
/** A wallet must stay rent-exempt after paying: Solana's floor for an empty account. */
const WALLET_FLOOR_LAMPORTS = 890_880;
const MAX_TX_BYTES = 1232;
/**
 * Room left for the wallet. Phantom adds its Lighthouse assertions (its program key and a short
 * instruction per account it guards) to a transaction it receives unsigned, and a priority fee
 * where there is none; a start built to the last byte would leave it nothing.
 */
const WALLET_HEADROOM_BYTES = 200;

export type StartInput = {
  readonly owner: PublicKey;
  /** The stock every payment saves into: one the chain can price for an automatic save. */
  readonly asset: Asset;
  readonly rateBps: number;
  /**
   * What the rule counts as arriving when it turns on (`./first.ts`), USDC base units, as the
   * card showed it before the saver signed. 0 starts with the next payment.
   */
  readonly firstUsdc: bigint;
  /** 1 when the saver attested what an xStocks token is and that they are not a US person. */
  readonly termsVersion: number;
};

export type BuiltStart = {
  readonly transactions: readonly string[];
  readonly lastValidBlockHeight: number;
  readonly slug: string;
  /** Plans this wallet was invited to, joined in the same approval. */
  readonly joins: number;
  /** The first payment the rule saves, and its slice; null when it starts with the next one. */
  readonly first: { readonly basisUsdc: string; readonly sliceUsdc: string } | null;
  /** What starting sets aside: deposits that come back, the prepaid saves, the network fee. */
  readonly cost: { readonly depositLamports: number; readonly prepaidLamports: number; readonly feeLamports: number };
};

export async function buildStart(input: StartInput): Promise<Outcome<BuiltStart>> {
  const { owner, asset, firstUsdc } = input;
  const conn = connection();
  const book = await loadBook(owner.toBase58());
  if (!book.ok) return book;
  if (book.value.book) return held("This wallet already saves every payment. Change it under Every payment.");

  const usdcMint = usdcMintFor(null);
  const terms = validateRule({ rateBps: input.rateBps, escalateBps: 0, floorUsdc: 0n, capUsdc: DEFAULT_CAP_USDC, toleranceBps: DEFAULT_TOLERANCE_BPS });
  if (!terms.ok) return terms;
  const slug = nameFromAddress(owner.toBase58());
  const open = openBookIx({ owner, slug, asset, usdcMint, termsVersion: input.termsVersion });
  if (!open.ok) return open;
  const rule = enableRuleIxs({ owner, usdcMint, terms: terms.value, allowanceUsdc: DEFAULT_ALLOWANCE_USDC, floatLamports: SUGGESTED_FLOAT_LAMPORTS });
  if (!rule.ok) return rule;

  // The first payment: checked against what the wallet holds and what the program will accept.
  let hands: FirstHands | null = null;
  let first: BuiltStart["first"] = null;
  let holdingRent = 0;
  if (firstUsdc > 0n) {
    const slice = sliceOf(firstUsdc, input.rateBps);
    if (firstUsdc < DEFAULT_MIN_INBOUND || slice < MIN_SLICE) return held("That first payment is too small for the rule to save; start with the next one instead.");
    if (slice > FIRST_SLICE_MAX_USDC) return held("A first save takes at most $50. Nothing was signed.");
    if (!book.value.usdc.exists || book.value.usdc.balance < firstUsdc) return held("This wallet holds less USDC than that payment now. Nothing was signed.");
    holdingRent = Number(await rentFor(conn, USDC_ACCOUNT_BYTES));
    hands = await firstPaymentHands({ owner, usdcMint, basisUsdc: firstUsdc, seed: holdingSeed(), rentLamports: holdingRent });
    first = { basisUsdc: firstUsdc.toString(), sliceUsdc: slice.toString() };
  }

  // A sponsor's invitation, accepted in the same approval: the match needs no second visit.
  const memberships = await membershipsOf(owner.toBase58());
  const joins: TransactionInstruction[] = [];
  for (const m of memberships.ok ? memberships.value : []) {
    if (m.member.status !== "invited") continue;
    const ix = acceptMemberIx({ owner, plan: new PublicKey(m.plan.pda) });
    if (ix.ok) joins.push(ix.value);
  }
  const ixs = startInstructions({
    owner,
    open: [...openUsdcIfMissing(owner, usdcMint, book.value.usdc.exists), open.value],
    rule: rule.value,
    joins,
    hands,
  });

  const depositLamports = Number(book.value.openCostLamports + book.value.usdcAccountRentLamports);
  const prepaidLamports = Number(SUGGESTED_FLOAT_LAMPORTS);
  const haveLamports = Number(book.value.ownerLamports);

  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }

  const built = await assembleMeasured(conn, owner, blockhash, ixs, RULE_MICRO_LAMPORTS, MAX_TX_BYTES - WALLET_HEADROOM_BYTES);
  if (!built.ok) {
    if (built.why === "sol") {
      // The holding account's rent is lent and returned inside the transaction, but the wallet must hold it while it runs.
      const need = depositLamports + prepaidLamports + holdingRent + BASE_FEE_LAMPORTS + WALLET_FLOOR_LAMPORTS;
      return held(
        `Starting needs about ${sol(need)} of SOL in this wallet: ${sol(depositLamports)} of deposits that come back if you ever stop and close, and ${sol(prepaidLamports)} that prepays your next automatic saves. It has ${sol(haveLamports)}. Nothing was signed.`,
      );
    }
    if (built.why === "usdc") return held("This wallet holds less USDC than that payment now. Nothing was signed.");
    if (built.why === "size") return held("This start has too many Plan invitations to fit in one approval. Join them from your savings page afterwards.");
    return held(`Starting would fail right now (${built.why}). Nothing was signed; try again in a moment.`);
  }
  return ok({
    transactions: [b64(built.value.tx)],
    lastValidBlockHeight,
    slug,
    joins: joins.length,
    first,
    cost: { depositLamports, prepaidLamports, feeLamports: built.value.feeLamports },
  });
}

/**
 * Put instructions behind a measured compute budget: simulate with room to spare, then set
 * the limit a quarter above what was used. Held "size" when it cannot fit in a transaction,
 * "sol", "usdc" or "price" for those refusals, and the program's own words for anything else.
 */
async function assembleMeasured(
  conn: ReturnType<typeof connection>,
  owner: PublicKey,
  blockhash: string,
  ixs: readonly TransactionInstruction[],
  microLamports: number,
  maxBytes: number = MAX_TX_BYTES,
): Promise<Outcome<{ tx: VersionedTransaction; feeLamports: number }>> {
  const make = (units: number) =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }), ...ixs],
      }).compileToV0Message(),
    );
  let probe: VersionedTransaction;
  try {
    probe = make(SIMULATE_UNITS);
    if (probe.serialize().length > maxBytes) return held("size");
  } catch {
    // compileToV0Message or serialize throws when the message cannot be encoded at all.
    return held("size");
  }
  let used = 200_000;
  try {
    const sim = await conn.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const refusal = readSimulation(sim.value.err, sim.value.logs);
    if (refusal) return held(refusal.kind === "other" ? refusal.detail : refusal.kind);
    if (typeof sim.value.unitsConsumed === "number" && sim.value.unitsConsumed > 0) used = sim.value.unitsConsumed;
  } catch {
    // A simulation the RPC cannot run does not block the start; the wallet still checks.
  }
  // Generous on purpose: Phantom adds its Lighthouse checks inside this budget, and its support
  // names a budget too tight for them as a cause of its warning. 200,000 units at this price is
  // 20,000 lamports, a fiftieth of a cent's worth more than a tight one.
  const units = Math.min(SIMULATE_UNITS, Math.max(Math.ceil(used * 1.5) + 50_000, MIN_UNITS));
  const tx = make(units);
  if (tx.serialize().length > maxBytes) return held("size");
  return ok({ tx, feeLamports: BASE_FEE_LAMPORTS + Math.ceil((units * microLamports) / 1e6) });
}

function b64(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}
