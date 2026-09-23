import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { readBookOf } from "@/lib/book/read-book";
import { quoteIntake } from "@/lib/intake/build";
import { connection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * QUOTE A PAYMENT — what this many dollars becomes for this recipient, right now.
 *
 * The recipient's Book names the asset; Jupiter names the route; the payer sees units, the
 * least that will land, and the price impact before any wallet opens. No session needed: a
 * payer needs no account.
 */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "";
  const amount = req.nextUrl.searchParams.get("amount") ?? "";
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  const dollars = Number(amount);
  if (!Number.isFinite(dollars) || dollars <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  const amountUsdc = BigInt(Math.round(dollars * 1e6));

  const book = await readBookOf(connection(), ownerKey);
  if (!book.ok) return NextResponse.json({ error: book.why }, { status: 503 });
  const sponsor = req.nextUrl.searchParams.get("gift") === "1";
  if (!book.value && !sponsor) return NextResponse.json({ error: "This address has no register yet.", sponsor: true }, { status: 404 });
  // No book: the sponsored position is in the default asset; the recipient may change it after.
  const asset = book.value ? assetByMint(book.value.asset) : defaultAsset();
  if (!asset) return NextResponse.json({ error: "This book's asset is not on the registry." }, { status: 422 });

  const q = await quoteIntake(asset, amountUsdc);
  if (!q.ok) return NextResponse.json({ error: q.why }, { status: 422 });
  return NextResponse.json({ asset: { symbol: asset.symbol, mint: asset.mint, decimals: asset.decimals, name: asset.name }, quote: q.value });
}
