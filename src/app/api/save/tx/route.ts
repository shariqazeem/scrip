import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { solUsd } from "@/lib/market";
import { parseSaveUsd } from "@/lib/save/amount";
import { buildSave } from "@/lib/save/build";
import { stockByMint } from "@/lib/save/catalogue";

export const dynamic = "force-dynamic";

/**
 * BUILD A SAVE — one versioned transaction for the saver to sign and send themselves:
 *
 *     [compute, compute price, memo "scrip:save:v1", open the stock account + the mark, jupiter…]
 *
 * The server assembles it because the route needs lookup tables and a blockhash from an RPC
 * that stays on the server, and it asks the chain whether the save would succeed before the
 * wallet is asked. It cannot sign, and it chooses nothing: the amount and the stock are the
 * saver's, the route and the minimum are Jupiter's at the slippage the sheet showed.
 */
export async function POST(req: NextRequest) {
  let body: { owner?: unknown; mint?: unknown; usd?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let owner: PublicKey;
  try {
    owner = new PublicKey(String(body.owner ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  if (!PublicKey.isOnCurve(owner.toBytes())) return NextResponse.json({ error: "The saver must be a wallet, not a program account." }, { status: 400 });
  const stock = stockByMint(String(body.mint ?? ""));
  if (!stock) return NextResponse.json({ error: "That stock is not one Scrip can save into." }, { status: 404 });
  const amount = parseSaveUsd(typeof body.usd === "number" || typeof body.usd === "string" ? body.usd : "");
  if (!amount.ok) return NextResponse.json({ error: amount.why }, { status: 400 });

  const [built, sol] = await Promise.all([buildSave({ owner, stock, usdc: amount.usdc }), solUsd()]);
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
  return NextResponse.json({
    transactionBase64: built.value.transactionBase64,
    quote: built.value.quote,
    cost: built.value.cost,
    solUsd: sol,
    lastValidBlockHeight: built.value.lastValidBlockHeight,
  });
}
