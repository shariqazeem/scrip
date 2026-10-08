import { NextResponse } from "next/server";
import { connection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * HAS IT LANDED — a page that sent a transaction through the wallet asks this until the chain
 * answers, so "done" is never said ahead of the chain. Pending, confirmed, or failed with why.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ sig: string }> }) {
  const { sig } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return NextResponse.json({ error: "That is not a transaction signature." }, { status: 400 });
  try {
    const st = (await connection().getSignatureStatuses([sig], { searchTransactionHistory: false })).value[0];
    if (!st) return NextResponse.json({ state: "pending" });
    if (st.err) return NextResponse.json({ state: "failed", error: JSON.stringify(st.err) });
    if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return NextResponse.json({ state: "confirmed" });
    return NextResponse.json({ state: "pending" });
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }
}
