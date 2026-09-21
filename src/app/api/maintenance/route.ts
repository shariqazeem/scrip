import { type NextRequest, NextResponse } from "next/server";
import { chainReader, runWatcher } from "@/lib/corporate-actions/watcher";
import { measureDue } from "@/lib/ledger/crank";
import { indexBooks, indexGrants, indexReceipts, refreshMeasurements } from "@/lib/ledger/indexer";
import { connection, mainnetConnection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE THINGS THAT HAVE TO KEEP HAPPENING, behind one door.
 *
 *   the multiplier watcher    records every rebase the issuers publish
 *   the receipt indexer       mirrors new receipts into the cache, incrementally
 *   the book indexer          mirrors every Book, for "wallets with the rule on"
 *   the measurement crank     calls measure_receipt at 7 and 30 days
 *   the measurement refresh   re-reads receipts whose windows were measured
 *
 * None of them is a source of truth. Guarded by a shared secret because the calls are
 * expensive, not dangerous. Unset means the route refuses outright.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCRIP_MAINTENANCE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Maintenance is not configured on this deployment." }, { status: 503 });
  const offered = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (offered !== secret) return NextResponse.json({ error: "No." }, { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  const conn = connection();
  // The registry's mints live on mainnet whatever cluster the program runs on: a rebase is a
  // mainnet fact. Reading them through the devnet endpoint found nothing and spent its rate.
  const watch = await runWatcher(chainReader(mainnetConnection()), now);
  const index = await indexReceipts(conn);
  const booksIndexed = await indexBooks(conn, now);
  const grantsIndexed = await indexGrants(conn, now);
  const measure = await measureDue(conn, now);
  const refreshed = await refreshMeasurements(conn, now);

  return NextResponse.json({
    at: now,
    multipliers: { anyHeld: watch.anyHeld, assets: watch.assets },
    receipts: index.ok ? index.value : { error: index.why },
    books: booksIndexed.ok ? { indexed: booksIndexed.value } : { error: booksIndexed.why },
    grants: grantsIndexed.ok ? { indexed: grantsIndexed.value } : { error: grantsIndexed.why },
    measure: measure.ok ? measure.value : { error: measure.why },
    refreshed: refreshed.ok ? refreshed.value : { error: refreshed.why },
  });
}
