import { type NextRequest, NextResponse } from "next/server";
import { chainReader, runWatcher } from "@/lib/corporate-actions/watcher";
import { connection } from "@/lib/book/read-book";
import { indexReceipts } from "@/lib/ledger/indexer";
import { measureCohorts } from "@/lib/ledger/measure";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE THREE THINGS THAT HAVE TO KEEP HAPPENING, behind one door.
 *
 *   the multiplier watcher   re-reads every rebasing mint and re-expresses positions
 *   the receipt indexer      mirrors new on-chain receipts into the cache
 *   the measurement pass     reads what matured cohorts still hold
 *
 * None of them is a source of truth and none can invent one: the watcher writes only what a
 * mint says, the indexer only what a receipt account says, and the measurement only what a
 * recipient's own token accounts say. Losing every row they have written costs speed and
 * nothing else — a re-run rebuilds it from Solana.
 *
 * Guarded by a shared secret, because the calls behind it are expensive rather than dangerous.
 * If `WEBGOLD_MAINTENANCE_SECRET` is unset the route refuses outright rather than running
 * open: an unset secret must fail toward "nobody may", never toward "anybody may".
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WEBGOLD_MAINTENANCE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Maintenance is not configured on this deployment." },
      { status: 503 },
    );
  }
  const offered = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (offered !== secret) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const watch = await runWatcher(chainReader(connection()), now);
  const index = await indexReceipts(100);
  const measure = await measureCohorts(now);

  return NextResponse.json({
    at: now,
    multipliers: {
      anyHeld: watch.anyHeld,
      assets: watch.assets.map((a) => ({
        symbol: a.symbol,
        inForce: a.inForce,
        pending: a.pending,
        recorded: a.recorded,
        reconciled: a.reconciled,
        heldWhy: a.heldWhy,
      })),
    },
    receipts: index.ok ? index.value : { error: index.why },
    cohorts: measure.ok ? measure.value : { error: measure.why },
  });
}
