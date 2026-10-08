import "server-only";

import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import { USDC_MINT } from "@/lib/assets/registry";
import { memoIx } from "@/lib/intake/instructions";
import { readSimulation } from "@/lib/intake/preflight";
import { type Quote, lookupTables, quote as jupQuote, swapInstructions } from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { rentFor } from "@/lib/solana/rent";
import { sol, usdc as usdcText } from "@/lib/format";
import { MAX_SAVE_USDC, MIN_SAVE_USDC } from "./amount";
import type { SaveStock } from "./catalogue";
import { SAVE_MARK, SAVE_MEMO } from "./mark";

/**
 * SAVE NOW — part of the USDC in this wallet becomes a stock in this wallet, in ONE
 * transaction the saver signs and sends themselves.
 *
 *     [compute limit, compute price, memo, open the stock account (+ the mark), jupiter…]
 *
 * No program of Scrip's runs, no delegate is granted, nothing waits for a keeper or a price:
 * it is a swap, so it works at a weekend. What makes it Scrip's is the memo, which says what
 * it was for, and the mark, which lets anyone list every save ever made (`mark.ts`).
 *
 * The saver's protection is their own quote. Jupiter's route refuses to deliver less than
 * the minimum at the slippage the sheet showed, so a price that moves past it fails the
 * transaction and spends nothing but the network fee. A route that would move the price
 * more than 1% is refused here, before a wallet opens.
 */
export const SAVE_SLIPPAGE_BPS = 50;
export const MAX_SAVE_IMPACT_PCT = 1;
/** Fewer accounts, a shorter route: it must fit in 1,232 bytes beside the memo and the mark. */
export const SAVE_MAX_ACCOUNTS = 30;
/**
 * Our own priority fee, so Phantom does not add its own. The limit is measured by simulating
 * first and set a quarter above what the route used; at this price a save pays well under a
 * cent to the network.
 */
export const SAVE_MICRO_LAMPORTS = 50_000;
const SIMULATE_UNITS = 1_000_000;
const BASE_FEE_LAMPORTS = 5_000;
/** A wallet's own balance must stay rent-exempt after it pays: Solana's floor for an empty account. */
const WALLET_FLOOR_LAMPORTS = 890_880;

export type SaveQuote = {
  readonly mint: string;
  readonly inUsdc: string;
  readonly outRaw: string;
  readonly minOutRaw: string;
  readonly impactPct: number;
  readonly slippageBps: number;
  readonly route: readonly string[];
  /** USD per whole token, implied by the quote. For display. */
  readonly perUnitUsd: number;
};

export type SaveCost = {
  /** What the network charges: the signature and the priority fee, at most. */
  readonly feeLamports: number;
  /**
   * A deposit that opens the saver's account for this stock, the first time only. It stays
   * with the account and comes back if the account is ever closed.
   */
  readonly depositLamports: number;
};

function tokenProgramOf(stock: Pick<SaveStock, "program">): PublicKey {
  return stock.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export function stockAccount(owner: PublicKey, stock: Pick<SaveStock, "mint" | "program">): PublicKey {
  return getAssociatedTokenAddressSync(new PublicKey(stock.mint), owner, false, tokenProgramOf(stock));
}

function summarise(stock: SaveStock, q: Quote, usdc: bigint): SaveQuote {
  const units = Number(q.outAmount) / 10 ** stock.decimals;
  return {
    mint: stock.mint,
    inUsdc: usdc.toString(),
    outRaw: q.outAmount,
    minOutRaw: q.otherAmountThreshold,
    impactPct: Number(q.priceImpactPct) * 100,
    slippageBps: q.slippageBps,
    route: [...new Set(q.routePlan.map((r) => r.swapInfo.label ?? r.swapInfo.ammKey.slice(0, 6)))],
    perUnitUsd: units > 0 ? Number(usdc) / 1e6 / units : 0,
  };
}

async function freshQuote(stock: SaveStock, usdc: bigint, maxAccounts = SAVE_MAX_ACCOUNTS): Promise<Outcome<Quote>> {
  if (usdc < MIN_SAVE_USDC) return held("The smallest save is $1.");
  if (usdc > MAX_SAVE_USDC) return held("The largest save in one go is $10,000.");
  const q = await jupQuote({ inputMint: USDC_MINT, outputMint: stock.mint, amount: usdc, slippageBps: SAVE_SLIPPAGE_BPS, maxAccounts });
  if (!q.ok) return q;
  const impact = Number(q.value.priceImpactPct) * 100;
  if (Number.isFinite(impact) && impact > MAX_SAVE_IMPACT_PCT) {
    return held(`At this size the route would move ${stock.name}'s price ${impact.toFixed(2)}%. Try a smaller amount, or another stock.`);
  }
  if (BigInt(q.value.outAmount) <= 0n) return held(`There is no route into ${stock.name} at this size right now.`);
  return q;
}

/** The quote the sheet shows, with what it costs this wallet if one is named. */
export async function quoteSave(stock: SaveStock, usdc: bigint, owner: PublicKey | null): Promise<Outcome<{ quote: SaveQuote; cost: SaveCost }>> {
  const q = await freshQuote(stock, usdc);
  if (!q.ok) return q;
  const deposit = owner ? await depositFor(owner, stock) : 0;
  return ok({
    quote: summarise(stock, q.value, usdc),
    cost: { feeLamports: BASE_FEE_LAMPORTS + Math.ceil((400_000 * SAVE_MICRO_LAMPORTS) / 1e6), depositLamports: deposit },
  });
}

/** Rent for the saver's stock account when it does not exist yet; zero when it does. */
export async function depositFor(owner: PublicKey, stock: SaveStock): Promise<number> {
  const conn = connection();
  const ata = stockAccount(owner, stock);
  const info = await conn.getAccountInfo(ata, "confirmed").catch(() => null);
  if (info) return 0;
  // A Token-2022 account carries the extensions its mint requires; size it from the mint.
  let size = 165;
  if (stock.program === "token-2022") {
    const { getAccountLenForMint, unpackMint } = await import("@solana/spl-token");
    const mintInfo = await conn.getAccountInfo(new PublicKey(stock.mint), "confirmed").catch(() => null);
    if (mintInfo) size = getAccountLenForMint(unpackMint(new PublicKey(stock.mint), mintInfo, TOKEN_2022_PROGRAM_ID));
  }
  return Number(await rentFor(conn, size));
}

/**
 * Open the saver's account for this stock if it is missing, and carry the mark on it,
 * read-only: the associated-token program reads its first six accounts and ignores the rest,
 * which is the Solana Pay "reference" convention. Simulated on mainnet before it shipped.
 */
export function openWithMark(owner: PublicKey, stock: Pick<SaveStock, "mint" | "program">): TransactionInstruction {
  const open = createAssociatedTokenAccountIdempotentInstruction(owner, stockAccount(owner, stock), owner, new PublicKey(stock.mint), tokenProgramOf(stock));
  open.keys.push({ pubkey: SAVE_MARK, isSigner: false, isWritable: false });
  return open;
}

export type BuiltSave = {
  readonly transactionBase64: string;
  readonly quote: SaveQuote;
  readonly cost: SaveCost;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
};

function assemble(input: {
  owner: PublicKey;
  units: number;
  blockhash: string;
  open: TransactionInstruction;
  route: { setup: TransactionInstruction[]; swap: TransactionInstruction; cleanup: TransactionInstruction | null };
  alts: AddressLookupTableAccount[];
}): VersionedTransaction {
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: input.units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SAVE_MICRO_LAMPORTS }),
    memoIx(input.owner, SAVE_MEMO),
    input.open,
    ...input.route.setup,
    input.route.swap,
    ...(input.route.cleanup ? [input.route.cleanup] : []),
  ];
  return new VersionedTransaction(new TransactionMessage({ payerKey: input.owner, recentBlockhash: input.blockhash, instructions: ixs }).compileToV0Message(input.alts));
}

/** The instructions of a save, before they are put in a transaction: what `start` composes with. */
export type SaveParts = {
  readonly quote: SaveQuote;
  readonly memo: TransactionInstruction;
  readonly open: TransactionInstruction;
  readonly setup: TransactionInstruction[];
  readonly swap: TransactionInstruction;
  readonly cleanup: TransactionInstruction | null;
  readonly alts: AddressLookupTableAccount[];
  readonly depositLamports: number;
};

/**
 * A save's instructions for a wallet that holds the USDC, checked the same way `buildSave`
 * checks them, but not yet assembled. `maxAccounts` asks Jupiter for a shorter route when the
 * save has to share its transaction with something else.
 */
export async function saveParts(input: { owner: PublicKey; stock: SaveStock; usdc: bigint; maxAccounts?: number }): Promise<Outcome<SaveParts>> {
  const { owner, stock, usdc } = input;
  const conn = connection();
  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner, false, TOKEN_PROGRAM_ID);
  const balance = await conn.getTokenAccountBalance(usdcAccount, "confirmed").then((r) => BigInt(r.value.amount)).catch(() => 0n);
  if (balance < usdc) return held(`This wallet holds ${usdcText(balance)} of USDC, and this save needs ${usdcText(usdc)}. Nothing was signed.`);
  const q = await freshQuote(stock, usdc, input.maxAccounts);
  if (!q.ok) return q;
  const ata = stockAccount(owner, stock);
  const route = await swapInstructions({ quote: q.value, userPublicKey: owner, destinationTokenAccount: ata });
  if (!route.ok) return route;
  const alts = await lookupTables(conn, route.value.lookupTableAddresses);
  if (!alts.ok) return alts;
  const open = openWithMark(owner, stock);
  const ataProgram = open.programId.toBase58();
  const setup = route.value.setup.filter((ix) => !(ix.programId.toBase58() === ataProgram && ix.keys[1]?.pubkey.equals(ata)));
  return ok({
    quote: summarise(stock, q.value, usdc),
    memo: memoIx(owner, SAVE_MEMO),
    open,
    setup,
    swap: route.value.swap,
    cleanup: route.value.cleanup,
    alts: alts.value,
    depositLamports: await depositFor(owner, stock),
  });
}

/**
 * Build the save, ask the chain whether it would succeed, and only then hand it to the
 * wallet. Every refusal is a sentence with both numbers in it, never a route's error code.
 */
export async function buildSave(input: { owner: PublicKey; stock: SaveStock; usdc: bigint }): Promise<Outcome<BuiltSave>> {
  const { owner, stock, usdc } = input;
  const conn = connection();
  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner, false, TOKEN_PROGRAM_ID);
  const [balance, lamports] = await Promise.all([
    conn.getTokenAccountBalance(usdcAccount, "confirmed").then((r) => BigInt(r.value.amount)).catch(() => 0n),
    conn.getBalance(owner, "confirmed").catch(() => 0),
  ]);
  if (balance < usdc) {
    return held(`This wallet holds ${usdcText(balance)} of USDC, and this save needs ${usdcText(usdc)}. Nothing was signed.`);
  }

  const q = await freshQuote(stock, usdc);
  if (!q.ok) return q;
  const ata = stockAccount(owner, stock);
  const route = await swapInstructions({ quote: q.value, userPublicKey: owner, destinationTokenAccount: ata });
  if (!route.ok) return route;
  const alts = await lookupTables(conn, route.value.lookupTableAddresses);
  if (!alts.ok) return alts;

  const open = openWithMark(owner, stock);
  // Jupiter opens accounts it is told are missing; ours is opened above, so drop a duplicate.
  const ataProgram = open.programId.toBase58();
  const setup = route.value.setup.filter((ix) => !(ix.programId.toBase58() === ataProgram && ix.keys[1]?.pubkey.equals(ata)));

  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  const parts = { owner, blockhash, open, route: { setup, swap: route.value.swap, cleanup: route.value.cleanup }, alts: alts.value };

  let probe: VersionedTransaction;
  try {
    probe = assemble({ ...parts, units: SIMULATE_UNITS });
  } catch (err) {
    return held(`The save could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (probe.serialize().length > 1232) return held("This route is too long for one transaction right now. Try again in a moment.");

  const deposit = await depositFor(owner, stock);
  // Ask the chain before asking the wallet: a save that would fail is refused here.
  let unitsUsed = 300_000;
  try {
    const sim = await conn.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const refusal = readSimulation(sim.value.err, sim.value.logs);
    if (refusal) {
      if (refusal.kind === "sol") {
        const need = BASE_FEE_LAMPORTS + Math.ceil((SIMULATE_UNITS * SAVE_MICRO_LAMPORTS) / 1e6) + deposit + WALLET_FLOOR_LAMPORTS;
        return held(
          `This wallet needs a little SOL for the network: about ${sol(need)}${deposit ? `, most of it a deposit that opens your ${stock.name} account and comes back if you close it` : ""}. It has ${sol(lamports)}. Nothing was signed.`,
        );
      }
      if (refusal.kind === "usdc") return held(`This wallet holds less USDC than this save. Nothing was signed.`);
      if (refusal.kind === "price") return held("The price moved while the route was being quoted. Try again; nothing was signed.");
      return held(`This save would fail right now (${refusal.detail}). Nothing was signed; try again in a moment.`);
    }
    if (typeof sim.value.unitsConsumed === "number" && sim.value.unitsConsumed > 0) unitsUsed = sim.value.unitsConsumed;
  } catch {
    // A simulation the RPC cannot run does not block the save; the wallet still checks.
  }

  const units = Math.min(1_400_000, Math.ceil(unitsUsed * 1.25) + 20_000);
  let tx: VersionedTransaction;
  try {
    tx = assemble({ ...parts, units });
  } catch (err) {
    return held(`The save could not be assembled (${err instanceof Error ? err.message : String(err)}).`);
  }
  return ok({
    transactionBase64: Buffer.from(tx.serialize()).toString("base64"),
    quote: summarise(stock, q.value, usdc),
    cost: { feeLamports: BASE_FEE_LAMPORTS + Math.ceil((units * SAVE_MICRO_LAMPORTS) / 1e6), depositLamports: deposit },
    blockhash,
    lastValidBlockHeight,
  });
}
