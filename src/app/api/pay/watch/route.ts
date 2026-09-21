import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { intakes } from "@/lib/db/schema";
import { connection } from "@/lib/solana/connection";
import { payoutPda, receiptPda, releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * WATCH A RELEASE — the pay page polls this after showing a QR, so a phone that paid lands
 * the desktop on the receipt. The answer comes from the chain: does the receipt account for
 * this release exist yet, and which signature wrote it.
 */
export async function GET(req: NextRequest) {
  const rid = req.nextUrl.searchParams.get("rid") ?? "";
  const parsed = releaseIdFromHex(rid);
  if (!parsed.ok) return NextResponse.json({ error: parsed.why }, { status: 400 });
  const row = (await db.select().from(intakes).where(eq(intakes.releaseId, rid)).limit(1))[0];
  if (!row) return NextResponse.json({ state: "unknown" });
  const conn = connection();
  const payout = payoutPda(new PublicKey(row.payer), parsed.value);
  const receipt = receiptPda(payout, parsed.value);
  try {
    const info = await conn.getAccountInfo(receipt, "confirmed");
    if (!info) {
      const open = await conn.getAccountInfo(payout, "confirmed");
      return NextResponse.json({ state: open ? "waiting-for-claim" : "pending" });
    }
    const sigs = await conn.getSignaturesForAddress(receipt, { limit: 1 }, "confirmed");
    return NextResponse.json({ state: "settled", signature: sigs[0]?.signature ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
