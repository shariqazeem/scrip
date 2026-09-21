import { and, desc, eq, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { grants, receipts } from "@/lib/db/schema";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

function csv(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}

/** What the signed-in wallet paid or granted, as CSV, each row with its signature and account. */
export async function GET(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const what = req.nextUrl.searchParams.get("what") ?? "payments";
  if (what === "grants") {
    const rows = await db.select().from(grants).where(eq(grants.payer, owner)).orderBy(desc(grants.createdUnix));
    const body = csv([
      ["grant", "recipient", "asset", "total_raw", "released_raw", "state", "start_unix", "cliff_secs", "duration_secs", "revocable", "declared_usdc", "reason", "run_id"],
      ...rows.map((g) => [g.pda, g.recipient, g.asset, g.totalRaw, g.releasedRaw, g.state, g.startUnix, g.cliffSecs, g.durationSecs, g.revocable, g.declaredUsdc / 1e6, g.reason, g.runId]),
    ]);
    return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="scrip-grants-${owner.slice(0, 6)}.csv"` } });
  }
  const rows = await db.select().from(receipts).where(and(eq(receipts.payer, owner), ne(receipts.kind, "sweep"))).orderBy(desc(receipts.settledUnix));
  const body = csv([
    ["settled_utc", "kind", "recipient", "paid_usdc", "asset", "amount_raw", "reason", "run_id", "signature", "receipt_account"],
    ...rows.map((r) => [new Date(r.settledUnix * 1000).toISOString(), r.kind, r.recipient, r.paidUsdc / 1e6, r.asset, r.amountRaw, r.reason, r.runId, r.sig, r.pda]),
  ]);
  return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="scrip-payments-${owner.slice(0, 6)}.csv"` } });
}
