import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { TOO_LONG, buildBuy, buildGraduate, buildLaunch, buildSell, buildSwap } from "@/lib/curve/build";
import { DEPLOYED } from "@/lib/curve/deployed";
import { launchAt } from "@/lib/curve/launches";
import { isCurveStock } from "@/lib/curve/preset";
import { siteUrl } from "@/lib/site";
import { connection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * BUILD A SCRIP CURVE TRANSACTION — a swap, a launch, a buy or a sale, for the address the wallet
 * gave (`lib/curve/build.ts`). Only that wallet can sign what comes back, so it needs no sign-in;
 * a launch also needs the new token's own signature, which the browser adds from a keypair it made
 * and never sends here. Every answer is ONE transaction, simulated first, or says why it cannot be.
 *
 *   { action: "swap", owner, stock, usd }                 USDC into the stock, the first of two approvals
 *   { action: "launch", owner, stock, kind?, name, symbol, mint, stockRaw? }   a first buy from stock held
 *   { action: "buy", owner, pool, usd | stockRaw }        409 { swapFirst } when a USDC buy is too long
 *   { action: "sell", owner, pool, tokens }               tokens in the launch's base units
 *   { action: "graduate", owner, pool, firstNft, secondNft }   a full curve into DAMM v2; the two
 *                                                         position mints are keys the browser made
 */
const MAX_USD = 10_000;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let owner: PublicKey;
  try {
    owner = new PublicKey(String(body.owner ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  if (!PublicKey.isOnCurve(owner.toBytes())) return NextResponse.json({ error: "A wallet signs this, not a program account." }, { status: 400 });
  const usd = body.usd === undefined || body.usd === null || body.usd === "" ? 0 : Number(body.usd);
  if (!Number.isFinite(usd) || usd < 0 || usd > MAX_USD) return NextResponse.json({ error: `An amount is between $0 and $${MAX_USD.toLocaleString("en-US")}.` }, { status: 400 });
  const usdc = BigInt(Math.round(usd * 1e6));
  let stockRaw: bigint | undefined;
  try {
    stockRaw = body.stockRaw === undefined || body.stockRaw === null || body.stockRaw === "" ? undefined : BigInt(String(body.stockRaw));
  } catch {
    return NextResponse.json({ error: "That amount of stock could not be read." }, { status: 400 });
  }
  if (stockRaw !== undefined && stockRaw < 0n) return NextResponse.json({ error: "That amount of stock could not be read." }, { status: 400 });
  const conn = connection();

  if (body.action === "swap") {
    if (!isCurveStock(body.stock)) return NextResponse.json({ error: "Choose one of the four stocks." }, { status: 400 });
    if (usd < 1) return NextResponse.json({ error: "A swap is at least $1." }, { status: 400 });
    const built = await buildSwap(conn, { owner, stock: body.stock, usdc });
    if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
    return NextResponse.json({ transactions: built.value.transactions, simulated: built.value.simulated, minOut: built.value.minOut.toString() });
  }

  if (body.action === "launch") {
    if (!isCurveStock(body.stock)) return NextResponse.json({ error: "Choose one of the four stocks." }, { status: 400 });
    let mint: PublicKey;
    try {
      mint = new PublicKey(String(body.mint ?? ""));
    } catch {
      return NextResponse.json({ error: "The new token's address is missing." }, { status: 400 });
    }
    const kind = body.kind === "demonstration" ? "demonstration" : "public";
    const config = DEPLOYED.configs[body.stock]?.[kind]?.address;
    const built = await buildLaunch(conn, { owner, stock: body.stock, kind, config, table: DEPLOYED.lookupTable, name: String(body.name ?? ""), symbol: String(body.symbol ?? ""), mint, site: siteUrl(), firstStockRaw: stockRaw });
    if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
    return NextResponse.json({ transactions: built.value.transactions, pool: built.value.pool, simulated: built.value.simulated, firstStockRaw: built.value.firstStockRaw.toString() });
  }

  if (body.action === "graduate") {
    let firstNft: PublicKey;
    let secondNft: PublicKey;
    try {
      firstNft = new PublicKey(String(body.firstNft ?? ""));
      secondNft = new PublicKey(String(body.secondNft ?? ""));
    } catch {
      return NextResponse.json({ error: "The new pool's position keys are missing." }, { status: 400 });
    }
    const found = await launchAt(conn, String(body.pool ?? ""));
    if (!found.ok) return NextResponse.json({ error: found.why }, { status: 503 });
    if (!found.value) return NextResponse.json({ error: "That is not a Scrip Curve launch." }, { status: 404 });
    const built = await buildGraduate(conn, { owner, launch: found.value, table: DEPLOYED.lookupTable, firstNft, secondNft });
    if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
    return NextResponse.json({ transactions: built.value.transactions, simulated: built.value.simulated, dammPool: built.value.dammPool });
  }

  if (body.action === "buy" || body.action === "sell") {
    const found = await launchAt(conn, String(body.pool ?? ""));
    if (!found.ok) return NextResponse.json({ error: found.why }, { status: 503 });
    if (!found.value) return NextResponse.json({ error: "That is not a Scrip Curve launch." }, { status: 404 });
    if (body.action === "buy") {
      if (stockRaw === undefined && usd < 1) return NextResponse.json({ error: "A buy is at least $1." }, { status: 400 });
      const built = await buildBuy(conn, { owner, launch: found.value, table: DEPLOYED.lookupTable, ...(stockRaw !== undefined ? { stockRaw } : { usdc }) });
      // Too long for one transaction: the browser swaps first, then buys with the stock it got.
      if (!built.ok && built.why === TOO_LONG) return NextResponse.json({ swapFirst: true, stock: found.value.stock }, { status: 409 });
      if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
      return NextResponse.json({ transactions: built.value.transactions, simulated: built.value.simulated, tokensMin: built.value.tokensMin.toString() });
    }
    let tokens: bigint;
    try {
      tokens = BigInt(String(body.tokens ?? "0"));
    } catch {
      return NextResponse.json({ error: "Choose an amount to sell." }, { status: 400 });
    }
    const built = await buildSell(conn, { owner, launch: found.value, table: DEPLOYED.lookupTable, tokensRaw: tokens });
    if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
    return NextResponse.json({ transactions: built.value.transactions, simulated: built.value.simulated, stockMin: built.value.stockMin.toString() });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
