import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receipts } from "@/lib/db/schema";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/** The signed-in wallet's receipts as CSV: every row with its signature and account. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const rows = await db.select().from(receipts).where(eq(receipts.recipient, owner)).orderBy(desc(receipts.settledUnix));
  const cell = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const lines = [
    ["settled_utc", "kind", "payer", "basis_usdc", "rate_bps", "paid_usdc", "asset", "amount_raw", "reason", "run_id", "measured_7d_raw", "measured_30d_raw", "signature", "receipt_account"].map(cell).join(","),
    ...rows.map((r) =>
      [new Date(r.settledUnix * 1000).toISOString(), r.kind, r.payer, r.basisUsdc / 1e6, r.rateBps, r.paidUsdc / 1e6, r.asset, r.amountRaw, r.reason, r.runId, r.measured7dAt ? r.measured7dRaw : "", r.measured30dAt ? r.measured30dRaw : "", r.sig, r.pda].map(cell).join(","),
    ),
  ];
  return new NextResponse(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="scrip-receipts-${owner.slice(0, 6)}.csv"` } });
}
