import { ActivationType, SwapMode, deriveDbcPoolAddress, getCurrentPoint } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { readSimulation } from "@/lib/intake/preflight";
import * as jup from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { launchNameProblem } from "./names";
import { curveTable } from "./table";
import { nameOf } from "@/lib/save/names";
import type { ChainLaunch } from "./launches";
import { curveClient } from "./launches";
import { type CurveKind, type CurveStock, DBC_PROGRAM_ID, curveQuote, tokenBadge } from "./preset";

export { launchNameProblem };

/**
 * LAUNCH, BUY AND SELL ON SCRIP CURVE, AS TRANSACTIONS A WALLET SIGNS — built on the server with
 * Meteora's own SDK and Jupiter, simulated before the wallet is asked, and never signed here.
 *
 *   launch   a token on a Scrip Curve config in the chosen stock, optionally with a first buy
 *            paid in USDC (Jupiter turns it into the stock first; the curve is bought with the
 *            route's guaranteed minimum, so any surplus stays in the launcher's own wallet as
 *            stock). The new token's mint is a keypair the BROWSER makes and signs with after the
 *            wallet has signed, so the wallet sees the transaction first and can add its checks.
 *   buy      USDC into the stock (Jupiter), then the stock into the curve (DBC, partial fill, so a
 *            buy past graduation fills the curve and returns the rest); once graduated, Jupiter
 *            routes USDC to the token directly.
 *   sell     the token back into the curve for the stock, which stays in the seller's wallet.
 *
 * Every answer is ONE transaction, simulated against the wallet as it is now. When a step is too
 * long for one (a launch with its first buy and a Jupiter route), the caller takes two separate
 * approvals: the swap into the stock first, and only once it has landed, the curve, built for the
 * stock really in the wallet. Two dependent transactions under one prompt made Phantom simulate
 * the second against a wallet that did not yet hold the stock, so it warned "unsafe", and the time
 * spent in those warnings let the first one's blockhash run out (10 October). Nothing here holds
 * or moves anything: it describes what the wallet will be asked to sign.
 */

/** What `assemble` answers when the steps do not fit in one transaction: the caller swaps first. */
export const TOO_LONG = "too long for one transaction";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MAX_TX_BYTES = 1_232;
/** Room for what a wallet adds to an unsigned transaction (Phantom's Lighthouse checks). */
const WALLET_HEADROOM_BYTES = 200;
const MICRO_LAMPORTS = 50_000;
const SLIPPAGE_BPS = 100;
const CURVE_SLIPPAGE_BPS = 300;

/** The token's metadata address: a page of scrip.work that describes it, built from what was chosen. */
export function metadataUri(site: string, input: { name: string; symbol: string; stock: CurveStock }): string {
  const q = new URLSearchParams({ n: input.name.trim(), s: input.symbol.trim().toUpperCase(), k: input.stock });
  return `${site.replace(/\/$/, "")}/api/curve/meta?${q}`;
}

type Group = { ixs: TransactionInstruction[]; alts: AddressLookupTableAccount[] };

/** USDC into a curve stock, landing in the owner's own account: the instructions and the guaranteed minimum. */
async function usdcIntoStock(conn: Connection, owner: PublicKey, stock: CurveStock, usdc: bigint): Promise<Outcome<Group & { minOut: bigint; expectedOut: bigint }>> {
  const quote = curveQuote(stock);
  const q = await jup.quote({ inputMint: USDC_MINT, outputMint: quote.mint, amount: usdc, slippageBps: SLIPPAGE_BPS, maxAccounts: 28 });
  if (!q.ok) return held(q.why);
  const mint = new PublicKey(quote.mint);
  const account = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const sw = await jup.swapInstructions({ quote: q.value, userPublicKey: owner, destinationTokenAccount: account });
  if (!sw.ok) return held(sw.why);
  const alts = await jup.lookupTables(conn, sw.value.lookupTableAddresses);
  if (!alts.ok) return held(alts.why);
  return ok({
    ixs: [createAssociatedTokenAccountIdempotentInstruction(owner, account, owner, mint, TOKEN_2022_PROGRAM_ID), ...sw.value.setup, sw.value.swap, ...(sw.value.cleanup ? [sw.value.cleanup] : [])],
    alts: alts.value,
    minOut: BigInt(q.value.otherAmountThreshold),
    expectedOut: BigInt(q.value.outAmount),
  });
}

/** An SDK transaction's own instructions, without its compute budget: the caller sets one for the whole. */
function own(ixs: readonly TransactionInstruction[]): TransactionInstruction[] {
  return ixs.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));
}

/** One transaction on the owner's budget, simulated first; `TOO_LONG` when it cannot fit with the wallet's headroom. */
async function assemble(conn: Connection, owner: PublicKey, groups: readonly Group[], units: number, paysWith = "USDC"): Promise<Outcome<{ txs: VersionedTransaction[]; simulated: boolean }>> {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const seen = new Set<string>();
  const tables = groups.flatMap((x) => x.alts).filter((t) => (seen.has(t.key.toBase58()) ? false : (seen.add(t.key.toBase58()), true)));
  let tx: VersionedTransaction;
  try {
    tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(1_400_000, units) }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: MICRO_LAMPORTS }), ...groups.flatMap((x) => x.ixs)],
      }).compileToV0Message(tables),
    );
    if (tx.serialize().length > MAX_TX_BYTES - WALLET_HEADROOM_BYTES) return held(TOO_LONG);
  } catch {
    // compileToV0Message or serialize throws when the message cannot be encoded at all.
    return held(TOO_LONG);
  }
  try {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const refusal = readSimulation(sim.value.err, sim.value.logs);
    if (refusal) {
      if (refusal.kind === "sol") return held("This wallet needs a little more SOL for the network fee and the new accounts.");
      if (refusal.kind === "usdc") return held(`This wallet holds less ${paysWith} than that.`);
      if (refusal.kind === "price") return held("The price moved before it could be checked. Try again.");
      return held(`The chain refused it in a dry run: ${refusal.detail}`);
    }
    return ok({ txs: [tx], simulated: true });
  } catch {
    // A simulation the RPC cannot run never blocks: the wallet still checks.
    return ok({ txs: [tx], simulated: false });
  }
}

export type Built = { readonly transactions: string[]; readonly simulated: boolean };
const b64 = (txs: readonly VersionedTransaction[]) => txs.map((t) => Buffer.from(t.serialize()).toString("base64"));

/** USDC into a curve stock, in the owner's own wallet: the first of two approvals when one transaction cannot carry a step. */
export async function buildSwap(conn: Connection, input: { owner: PublicKey; stock: CurveStock; usdc: bigint }): Promise<Outcome<Built & { minOut: bigint }>> {
  if (input.usdc <= 0n) return held("Choose an amount.");
  const leg = await usdcIntoStock(conn, input.owner, input.stock, input.usdc);
  if (!leg.ok) return leg;
  const built = await assemble(conn, input.owner, [leg.value], 600_000);
  if (!built.ok) return built;
  return ok({ transactions: b64(built.value.txs), simulated: built.value.simulated, minOut: leg.value.minOut });
}

/** A launch on a Scrip Curve config. `mint` is the new token's address; its keypair stays in the browser. */
export async function buildLaunch(
  conn: Connection,
  input: { owner: PublicKey; stock: CurveStock; kind: CurveKind; config: string | null | undefined; table?: string | null; name: string; symbol: string; mint: PublicKey; site: string; firstStockRaw?: bigint },
): Promise<Outcome<Built & { pool: string; firstStockRaw: bigint }>> {
  const problem = launchNameProblem(input.name, input.symbol);
  if (problem) return held(problem);
  const config = input.config ? { address: input.config } : null;
  if (!config) return held(`Scrip Curve is not open in ${nameOf(input.stock)} yet.`);
  const quoteMint = new PublicKey(curveQuote(input.stock).mint);
  const groups: Group[] = [];
  // Paid from stock the wallet already holds (the swap, when there is one, landed first).
  const first = input.firstStockRaw ?? 0n;
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  const createPoolParam = {
    name,
    symbol,
    uri: metadataUri(input.site, { name, symbol, stock: input.stock }),
    payer: input.owner,
    poolCreator: input.owner,
    config: new PublicKey(config.address),
    baseMint: input.mint,
    // Meteora checks the quote's token badge when the pool is created, not only the config.
    tokenBadge: tokenBadge(DBC_PROGRAM_ID, quoteMint),
  };
  let pool: TransactionInstruction[];
  try {
    const dbc = curveClient(conn);
    const tx =
      first > 0n
        ? await dbc.creator.createPoolWithFirstBuy({
            createPoolParam,
            // In the transaction that creates the pool, nobody can trade ahead of this buy.
            firstBuyParam: { buyer: input.owner, buyAmount: new BN(first.toString()), minimumAmountOut: new BN(0), referralTokenAccount: null },
          })
        : await dbc.creator.createPool(createPoolParam);
    pool = own(tx.instructions);
  } catch (err) {
    return held(`The launch could not be built (${err instanceof Error ? err.message : String(err)}).`);
  }
  groups.push({ ixs: pool, alts: await curveTable(conn, input.table) });
  const built = await assemble(conn, input.owner, groups, first > 0n ? 900_000 : 400_000, nameOf(input.stock));
  if (!built.ok) return built;
  return ok({
    transactions: b64(built.value.txs),
    simulated: built.value.simulated,
    pool: deriveDbcPoolAddress(quoteMint, input.mint, new PublicKey(config.address)).toBase58(),
    firstStockRaw: first,
  });
}

/** A buy of a launch, paid in USDC (or in its stock, `stockRaw`). */
export async function buildBuy(conn: Connection, input: { owner: PublicKey; launch: ChainLaunch; table?: string | null; usdc?: bigint; stockRaw?: bigint }): Promise<Outcome<Built & { tokensMin: bigint }>> {
  const { launch } = input;
  if (launch.migrated) {
    // Graduated: the pool is Meteora DAMM v2, which Jupiter routes, from USDC straight to the token.
    if (!input.usdc) return held("Buy a graduated launch with USDC.");
    const q = await jup.quote({ inputMint: USDC_MINT, outputMint: launch.baseMint, amount: input.usdc, slippageBps: CURVE_SLIPPAGE_BPS, maxAccounts: 40 });
    if (!q.ok) return held(q.why);
    const account = getAssociatedTokenAddressSync(new PublicKey(launch.baseMint), input.owner, false);
    const sw = await jup.swapInstructions({ quote: q.value, userPublicKey: input.owner, destinationTokenAccount: account });
    if (!sw.ok) return held(sw.why);
    const alts = await jup.lookupTables(conn, sw.value.lookupTableAddresses);
    if (!alts.ok) return held(alts.why);
    const ixs = [createAssociatedTokenAccountIdempotentInstruction(input.owner, account, input.owner, new PublicKey(launch.baseMint)), ...sw.value.setup, sw.value.swap, ...(sw.value.cleanup ? [sw.value.cleanup] : [])];
    const built = await assemble(conn, input.owner, [{ ixs, alts: alts.value }], 600_000);
    if (!built.ok) return built;
    return ok({ transactions: b64(built.value.txs), simulated: built.value.simulated, tokensMin: BigInt(q.value.otherAmountThreshold) });
  }
  const groups: Group[] = [];
  let amountIn = input.stockRaw ?? 0n;
  if (!amountIn && input.usdc && input.usdc > 0n) {
    const leg = await usdcIntoStock(conn, input.owner, launch.stock, input.usdc);
    if (!leg.ok) return leg;
    groups.push(leg.value);
    amountIn = leg.value.minOut;
  }
  if (amountIn <= 0n) return held("Choose an amount to buy.");
  const dbc = curveClient(conn);
  let tokensMin = 0n;
  let ixs: TransactionInstruction[];
  try {
    const [virtualPool, config, currentPoint] = await Promise.all([dbc.state.getPool(launch.pool), dbc.state.getPoolConfig(launch.config), getCurrentPoint(conn, ActivationType.Timestamp)]);
    if (!virtualPool || !config) return held("This launch could not be read.");
    const q = dbc.pool.swapQuote2({ virtualPool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint, slippageBps: CURVE_SLIPPAGE_BPS, swapMode: SwapMode.PartialFill, amountIn: new BN(amountIn.toString()) });
    tokensMin = BigInt((q.minimumAmountOut ?? new BN(0)).toString());
    const tx = await dbc.pool.swap2({ owner: input.owner, pool: new PublicKey(launch.pool), swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.PartialFill, amountIn: new BN(amountIn.toString()), minimumAmountOut: new BN(tokensMin.toString()) });
    ixs = own(tx.instructions);
  } catch (err) {
    return held(`The buy could not be built (${err instanceof Error ? err.message : String(err)}).`);
  }
  groups.push({ ixs, alts: await curveTable(conn, input.table) });
  const built = await assemble(conn, input.owner, groups, groups.length > 1 ? 700_000 : 300_000, groups.length > 1 ? "USDC" : nameOf(launch.stock));
  if (!built.ok) return built;
  return ok({ transactions: b64(built.value.txs), simulated: built.value.simulated, tokensMin });
}

/** A sale of a launch back into its curve: the seller receives the stock. */
export async function buildSell(conn: Connection, input: { owner: PublicKey; launch: ChainLaunch; table?: string | null; tokensRaw: bigint }): Promise<Outcome<Built & { stockMin: bigint }>> {
  const { launch } = input;
  if (input.tokensRaw <= 0n) return held("Choose an amount to sell.");
  if (launch.migrated) {
    const q = await jup.quote({ inputMint: launch.baseMint, outputMint: curveQuote(launch.stock).mint, amount: input.tokensRaw, slippageBps: CURVE_SLIPPAGE_BPS, maxAccounts: 40 });
    if (!q.ok) return held(q.why);
    const mint = new PublicKey(curveQuote(launch.stock).mint);
    const account = getAssociatedTokenAddressSync(mint, input.owner, false, TOKEN_2022_PROGRAM_ID);
    const sw = await jup.swapInstructions({ quote: q.value, userPublicKey: input.owner, destinationTokenAccount: account });
    if (!sw.ok) return held(sw.why);
    const alts = await jup.lookupTables(conn, sw.value.lookupTableAddresses);
    if (!alts.ok) return held(alts.why);
    const ixs = [createAssociatedTokenAccountIdempotentInstruction(input.owner, account, input.owner, mint, TOKEN_2022_PROGRAM_ID), ...sw.value.setup, sw.value.swap, ...(sw.value.cleanup ? [sw.value.cleanup] : [])];
    const built = await assemble(conn, input.owner, [{ ixs, alts: alts.value }], 600_000);
    if (!built.ok) return built;
    return ok({ transactions: b64(built.value.txs), simulated: built.value.simulated, stockMin: BigInt(q.value.otherAmountThreshold) });
  }
  const dbc = curveClient(conn);
  try {
    const [virtualPool, config, currentPoint] = await Promise.all([dbc.state.getPool(launch.pool), dbc.state.getPoolConfig(launch.config), getCurrentPoint(conn, ActivationType.Timestamp)]);
    if (!virtualPool || !config) return held("This launch could not be read.");
    const q = dbc.pool.swapQuote2({ virtualPool, config, swapBaseForQuote: true, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint, slippageBps: CURVE_SLIPPAGE_BPS, swapMode: SwapMode.ExactIn, amountIn: new BN(input.tokensRaw.toString()) });
    const stockMin = BigInt((q.minimumAmountOut ?? new BN(0)).toString());
    const tx = await dbc.pool.swap2({ owner: input.owner, pool: new PublicKey(launch.pool), swapBaseForQuote: true, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn: new BN(input.tokensRaw.toString()), minimumAmountOut: new BN(stockMin.toString()) });
    const built = await assemble(conn, input.owner, [{ ixs: own(tx.instructions), alts: await curveTable(conn, input.table) }], 300_000, input.launch.symbol ?? "of this launch");
    if (!built.ok) return built;
    return ok({ transactions: b64(built.value.txs), simulated: built.value.simulated, stockMin });
  } catch (err) {
    return held(`The sale could not be built (${err instanceof Error ? err.message : String(err)}).`);
  }
}
