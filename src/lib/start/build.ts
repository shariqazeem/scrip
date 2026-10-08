import "server-only";

import {
  ComputeBudgetProgram,
  type AddressLookupTableAccount,
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
import { enableRuleIxs, openBookIx, openUsdcIfMissing } from "@/lib/rule/instructions";
import { DEFAULT_ALLOWANCE_USDC, DEFAULT_CAP_USDC, DEFAULT_TOLERANCE_BPS, SUGGESTED_FLOAT_LAMPORTS, validateRule } from "@/lib/rule/slice";
import { type SaveQuote, SAVE_MICRO_LAMPORTS, buildSave, saveParts } from "@/lib/save/build";
import type { SaveStock } from "@/lib/save/catalogue";
import { connection } from "@/lib/solana/connection";

/**
 * START — THE ONE FLOW. Every payment turned on, the first save made, and every Plan this
 * wallet was invited to joined, in ONE transaction the saver signs once:
 *
 *     [compute, memo, open the stock account (+ the mark), jupiter…,
 *      open the USDC account if missing, open_book, approve, prepay, enable_rule, accept_member…]
 *
 * Until 8 October these were three journeys on three pages with five wallet prompts: save
 * now, then "every payment" behind its own sign-in, then a Plan's invitation accepted
 * somewhere else. The program never needed them apart.
 *
 * The save goes first, so the starting point `enable_rule` reads is the balance after it:
 * the first save is never mistaken for income. When the route is too long to sit beside the
 * rule in 1,232 bytes, the same two halves go out as two transactions under one approval.
 * Everything else is the defaults the rule page already used: a $200 limit, prepaid saves,
 * no floor, a $5,000 cap per payment, and a name made from the address.
 */

/** A shorter route, so the save fits beside the rule. */
const SHARED_MAX_ACCOUNTS = 20;
const RULE_MICRO_LAMPORTS = 100_000;
const SIMULATE_UNITS = 1_400_000;
const BASE_FEE_LAMPORTS = 5_000;
/** A wallet must stay rent-exempt after paying: Solana's floor for an empty account. */
const WALLET_FLOOR_LAMPORTS = 890_880;
const MAX_TX_BYTES = 1232;

export type StartInput = {
  readonly owner: PublicKey;
  /** The stock every payment saves into: one the chain can price for an automatic save. */
  readonly asset: Asset;
  /** The same stock in the save catalogue, for the first save. Null when there is none. */
  readonly stock: SaveStock | null;
  readonly rateBps: number;
  /** The first save, in USDC base units. 0 starts every payment alone. */
  readonly saveUsdc: bigint;
  /** 1 when the saver attested what an xStocks token is and that they are not a US person. */
  readonly termsVersion: number;
};

export type BuiltStart = {
  /** One transaction when everything fits; otherwise the save, then the rule. */
  readonly transactions: readonly string[];
  readonly lastValidBlockHeight: number;
  readonly quote: SaveQuote | null;
  readonly slug: string;
  /** Plans this wallet was invited to, joined in the same approval. */
  readonly joins: number;
  /** What starting sets aside: deposits that come back, the prepaid saves, the network fee. */
  readonly cost: { readonly depositLamports: number; readonly prepaidLamports: number; readonly feeLamports: number };
};

export async function buildStart(input: StartInput): Promise<Outcome<BuiltStart>> {
  const { owner, asset, stock, saveUsdc } = input;
  const conn = connection();
  const book = await loadBook(owner.toBase58());
  if (!book.ok) return book;
  if (book.value.book) return held("This wallet already saves every payment. Change it under Every payment.");
  if (saveUsdc > 0n && (!stock || stock.mint !== asset.mint)) return held("The first save goes into the same stock as every payment.");

  const usdcMint = usdcMintFor(null);
  const terms = validateRule({ rateBps: input.rateBps, escalateBps: 0, floorUsdc: 0n, capUsdc: DEFAULT_CAP_USDC, toleranceBps: DEFAULT_TOLERANCE_BPS });
  if (!terms.ok) return terms;
  const slug = nameFromAddress(owner.toBase58());
  const open = openBookIx({ owner, slug, asset, usdcMint, termsVersion: input.termsVersion });
  if (!open.ok) return open;
  const rule = enableRuleIxs({ owner, usdcMint, terms: terms.value, allowanceUsdc: DEFAULT_ALLOWANCE_USDC, floatLamports: SUGGESTED_FLOAT_LAMPORTS });
  if (!rule.ok) return rule;

  // A sponsor's invitation, accepted in the same approval: the match needs no second visit.
  const memberships = await membershipsOf(owner.toBase58());
  const joins: TransactionInstruction[] = [];
  for (const m of memberships.ok ? memberships.value : []) {
    if (m.member.status !== "invited") continue;
    const ix = acceptMemberIx({ owner, plan: new PublicKey(m.plan.pda) });
    if (ix.ok) joins.push(ix.value);
  }
  const ruleIxs = [...openUsdcIfMissing(owner, usdcMint, book.value.usdc.exists), open.value, ...rule.value, ...joins];

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

  const shortOfSol = (extraDeposit: number, fee: number) => {
    const need = depositLamports + extraDeposit + prepaidLamports + fee + WALLET_FLOOR_LAMPORTS;
    return held(
      `Starting needs about ${sol(need)} of SOL in this wallet: ${sol(depositLamports + extraDeposit)} of deposits that come back if you ever stop and close, and ${sol(prepaidLamports)} that prepays your next automatic saves. It has ${sol(haveLamports)}. Nothing was signed.`,
    );
  };

  // ── every payment alone ──────────────────────────────────────────────────────────────
  if (saveUsdc === 0n || !stock) {
    const built = await assembleMeasured(conn, owner, blockhash, ruleIxs, [], RULE_MICRO_LAMPORTS);
    if (!built.ok) {
      if (built.why === "sol") return shortOfSol(0, BASE_FEE_LAMPORTS);
      return held(`Saving every payment would fail right now (${built.why}). Nothing was signed.`);
    }
    return ok({
      transactions: [b64(built.value.tx)],
      lastValidBlockHeight,
      quote: null,
      slug,
      joins: joins.length,
      cost: { depositLamports, prepaidLamports, feeLamports: built.value.feeLamports },
    });
  }

  // ── the first save and every payment, together ──────────────────────────────────────
  const parts = await saveParts({ owner, stock, usdc: saveUsdc, maxAccounts: SHARED_MAX_ACCOUNTS });
  if (!parts.ok) return parts;
  const p = parts.value;
  const together = [p.memo, p.open, ...p.setup, p.swap, ...(p.cleanup ? [p.cleanup] : []), ...ruleIxs];
  const combined = await assembleMeasured(conn, owner, blockhash, together, p.alts, SAVE_MICRO_LAMPORTS);
  if (combined.ok) {
    return ok({
      transactions: [b64(combined.value.tx)],
      lastValidBlockHeight,
      quote: p.quote,
      slug,
      joins: joins.length,
      cost: { depositLamports: depositLamports + p.depositLamports, prepaidLamports, feeLamports: combined.value.feeLamports },
    });
  }
  if (combined.why === "sol") return shortOfSol(p.depositLamports, BASE_FEE_LAMPORTS * 2);
  if (combined.why === "usdc") return held("This wallet holds less USDC than this first save. Nothing was signed.");
  if (combined.why === "price") return held("The price moved while the route was being quoted. Try again; nothing was signed.");
  if (combined.why !== "size") return held(`Starting would fail right now (${combined.why}). Nothing was signed; try again in a moment.`);

  // Too long for one transaction: the save as its own, then the rule, both under one approval.
  const [save, alone] = await Promise.all([
    buildSave({ owner, stock, usdc: saveUsdc }),
    assembleMeasured(conn, owner, blockhash, ruleIxs, [], RULE_MICRO_LAMPORTS),
  ]);
  if (!save.ok) return save;
  if (!alone.ok) {
    if (alone.why === "sol") return shortOfSol(save.value.cost.depositLamports, BASE_FEE_LAMPORTS * 2);
    return held(`Saving every payment would fail right now (${alone.why}). Nothing was signed.`);
  }
  return ok({
    transactions: [save.value.transactionBase64, b64(alone.value.tx)],
    lastValidBlockHeight: Math.min(lastValidBlockHeight, save.value.lastValidBlockHeight),
    quote: save.value.quote,
    slug,
    joins: joins.length,
    cost: {
      depositLamports: depositLamports + save.value.cost.depositLamports,
      prepaidLamports,
      feeLamports: save.value.cost.feeLamports + alone.value.feeLamports,
    },
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
  alts: readonly AddressLookupTableAccount[],
  microLamports: number,
): Promise<Outcome<{ tx: VersionedTransaction; feeLamports: number }>> {
  const make = (units: number) =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }), ...ixs],
      }).compileToV0Message([...alts]),
    );
  let probe: VersionedTransaction;
  try {
    probe = make(SIMULATE_UNITS);
    if (probe.serialize().length > MAX_TX_BYTES) return held("size");
  } catch {
    // compileToV0Message or serialize throws when the message cannot be encoded at all.
    return held("size");
  }
  let used = 400_000;
  try {
    const sim = await conn.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const refusal = readSimulation(sim.value.err, sim.value.logs);
    if (refusal) return held(refusal.kind === "other" ? refusal.detail : refusal.kind);
    if (typeof sim.value.unitsConsumed === "number" && sim.value.unitsConsumed > 0) used = sim.value.unitsConsumed;
  } catch {
    // A simulation the RPC cannot run does not block the start; the wallet still checks.
  }
  const units = Math.min(SIMULATE_UNITS, Math.ceil(used * 1.25) + 20_000);
  const tx = make(units);
  if (tx.serialize().length > MAX_TX_BYTES) return held("size");
  return ok({ tx, feeLamports: BASE_FEE_LAMPORTS + Math.ceil((units * microLamports) / 1e6) });
}

function b64(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}
