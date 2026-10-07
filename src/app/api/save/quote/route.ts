import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { parseSaveUsd } from "@/lib/save/amount";
import { stockByMint } from "@/lib/save/catalogue";
import { cachedQuote } from "@/lib/save/quote-cache";

export const dynamic = "force-dynamic";

/**
 * QUOTE A SAVE — what this many dollars becomes in this stock, right now, and what the
 * network charges this wallet for it. No session: the quote is the same for anyone, and the
 * wallet, when named, only adds whether its account for this stock already exists.
 */
export async function GET(req: NextRequest) {
  const stock = stockByMint(req.nextUrl.searchParams.get("mint") ?? "");
  if (!stock) return NextResponse.json({ error: "That stock is not one Scrip can save into." }, { status: 404 });
  const amount = parseSaveUsd(req.nextUrl.searchParams.get("usd") ?? "");
  if (!amount.ok) return NextResponse.json({ error: amount.why }, { status: 400 });
  let owner: PublicKey | null = null;
  const o = req.nextUrl.searchParams.get("owner");
  if (o) {
    try {
      owner = new PublicKey(o);
    } catch {
      return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
    }
  }
  const q = await cachedQuote(stock, amount.usdc, owner);
  if (!q.ok) return NextResponse.json({ error: q.why }, { status: 422 });
  return NextResponse.json(q.value);
}
