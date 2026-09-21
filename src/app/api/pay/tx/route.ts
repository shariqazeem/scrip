import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { readBookOf } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { intakes } from "@/lib/db/schema";
import { buildIntake } from "@/lib/intake/build";
import { connection } from "@/lib/solana/connection";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * BUILD THE PAYMENT — one versioned transaction for the payer to sign.
 *
 *     settle    [compute, memo, fund_payout, jupiter…, release_payout]   the recipient has a Book
 *     sponsor   [compute, memo, fund_payout, jupiter…]                   no Book: it waits for a claim
 *
 * The server assembles it because the route needs lookup tables and a blockhash from an RPC
 * that stays on the server. It cannot sign and chooses nothing: the amount is the payer's,
 * the asset is the recipient's (or the default, for a sponsor), the minimum is Jupiter's
 * promise at the slippage shown.
 */
export async function POST(req: NextRequest) {
  let body: { payer?: unknown; owner?: unknown; claimant?: unknown; dollars?: unknown; reason?: unknown; assetMint?: unknown; releaseId?: unknown; runId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let payer: PublicKey;
  try {
    payer = new PublicKey(String(body.payer ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  if (!PublicKey.isOnCurve(payer.toBytes())) return NextResponse.json({ error: "The payer must be a wallet, not a program account." }, { status: 400 });
  const dollars = Number(body.dollars);
  if (!Number.isFinite(dollars) || dollars <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason : "";
  const amountUsdc = BigInt(Math.round(dollars * 1e6));

  let owner: PublicKey | null = null;
  if (typeof body.owner === "string" && body.owner) {
    try {
      owner = new PublicKey(body.owner);
    } catch {
      return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
    }
    if (!PublicKey.isOnCurve(owner.toBytes())) return NextResponse.json({ error: "That address is a program account; nobody could spend what lands there." }, { status: 400 });
  }
  let claimant: PublicKey | null = null;
  if (typeof body.claimant === "string" && body.claimant) {
    try {
      claimant = new PublicKey(body.claimant);
    } catch {
      return NextResponse.json({ error: "The claim key is not a valid address." }, { status: 400 });
    }
  }
  if (!owner && !claimant) return NextResponse.json({ error: "Name a recipient, or a claim key." }, { status: 400 });

  let runId: Uint8Array | null = null;
  if (typeof body.runId === "string" && body.runId) {
    const r = releaseIdFromHex(body.runId);
    if (!r.ok) return NextResponse.json({ error: "That run id is not sixteen bytes of hex." }, { status: 400 });
    runId = r.value;
  }
  let releaseId: Uint8Array | undefined;
  if (typeof body.releaseId === "string" && body.releaseId) {
    const rid = releaseIdFromHex(body.releaseId);
    if (!rid.ok) return NextResponse.json({ error: rid.why }, { status: 400 });
    releaseId = rid.value;
  }

  const conn = connection();
  const book = owner ? await readBookOf(conn, owner) : null;
  if (book && !book.ok) return NextResponse.json({ error: book.why }, { status: 503 });
  const hasBook = !!book?.ok && !!book.value;
  const asset = hasBook ? assetByMint(book!.ok ? book!.value!.asset : "") : typeof body.assetMint === "string" ? assetByMint(body.assetMint) : defaultAsset();
  if (!asset || !asset.ruleEligible) return NextResponse.json({ error: "That asset is not on the registry." }, { status: 422 });

  const built = await buildIntake({
    payer,
    recipient: owner,
    claimant,
    asset,
    amountUsdc,
    reason,
    mode: hasBook ? "pay" : "gift",
    releaseId,
    runId,
  });
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });

  // Remember who asked for this release, so the page can watch for its receipt.
  await db
    .insert(intakes)
    .values({ releaseId: built.value.releaseId, payer: payer.toBase58(), owner: owner?.toBase58() ?? claimant?.toBase58() ?? "" })
    .onConflictDoUpdate({ target: intakes.releaseId, set: { payer: payer.toBase58() } });

  return NextResponse.json({ ...built.value, mode: hasBook ? "pay" : "gift", asset: { symbol: asset.symbol, decimals: asset.decimals } });
}
