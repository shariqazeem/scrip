import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ScrollText } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";
import { db } from "@/lib/db";
import { cohorts as cohortsTable } from "@/lib/db/schema";
import { indexReceipts, ledgerTotals, recentReceipts } from "@/lib/ledger/indexer";
import { bps, fromBase, grams, short, since, usd } from "@/lib/format";
import { KEEP_RATE_WINDOW_DAYS, type CohortRow, keepRate } from "@/lib/keep-rate";

export const metadata: Metadata = {
  title: "Ledger",
  description:
    "Everything Webgold has settled: value released, grams outstanding, receipts published, and keep-rate at thirty days. Aggregates and an event stream, fed by real receipts.",
};
export const dynamic = "force-dynamic";

/**
 * THE PUBLIC RECORD — aggregates and an event stream, never a browsable per-person balance.
 *
 * Every receipt here is public because it is anchored to a transaction that is already
 * public. What is NOT here is a searchable balance with somebody's name on it: chain data is
 * public, and a savings product should not be the surface that makes a person's net worth
 * findable. An individual book page is opt-in.
 *
 * The rows are real receipts or there are no rows. An empty ledger gets a designed waiting
 * state, because a sample row on the page whose entire job is to be checkable is the single
 * easiest claim for anyone to disprove.
 */
export default async function LedgerPage() {
  const [totals, events, cohortRows] = await Promise.all([
    ledgerTotals(),
    recentReceipts(25),
    db.select().from(cohortsTable),
  ]);

  // Refresh the cache AFTER the response, so a slow RPC never makes this page slow. Ported
  // from Sage, where `after()` is the difference between a fast page and a page that waits on
  // somebody else's endpoint.
  after(async () => {
    await indexReceipts(50);
  });

  const rate = keepRate(
    cohortRows.map(
      (c): CohortRow => ({
        recipient: c.recipient,
        releaseId: c.releaseId,
        valueAtReleaseBase: BigInt(c.valueAtReleaseBase),
        releasedAt: c.releasedAt,
        valueNowBase: c.valueNowBase === null ? null : BigInt(c.valueNowBase),
        measuredAt: c.measuredAt,
      }),
    ),
    Math.floor(Date.now() / 1000),
  );

  return (
    <PageFrame
      eyebrow="Public record"
      title="Everything that has settled."
      sub="Fed by real receipts and nothing else. Every row links to an account anyone can open, anchored to a transaction that already happened."
    >
      <section className="wg-stats">
        <Stat label="Receipts published" value={totals.receipts.toLocaleString("en-US")} />
        <Stat label="Value released" value={usd(fromBase(totals.valueBase, 6))} />
        <Stat
          label="Grams outstanding"
          value={totals.grams > 0 ? grams(totals.grams) : "0.0000 g"}
          note="Stamped at each release, not re-priced since."
        />
        <Stat label="People paid" value={totals.recipients.toLocaleString("en-US")} />
        <Stat
          label={`Keep-rate at ${KEEP_RATE_WINDOW_DAYS} days`}
          value={rate.ok ? bps(rate.value.bps) : null}
          held={rate.ok ? null : rate.why}
          note={
            rate.ok
              ? `Over ${rate.value.cohorts} matured payout${rate.value.cohorts === 1 ? "" : "s"}. The denominator was stamped on chain when the value moved.`
              : undefined
          }
        />
      </section>

      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Settled events</span>
          {events.length > 0 ? (
            <span className="mono">{events.length} most recent</span>
          ) : null}
        </div>
        {events.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={22} strokeWidth={1.6} />}
            title="Nothing has settled yet"
            note="This stream is fed by receipts read off the chain. The first payout, gift or sponsorship to settle appears here with a link anyone can open."
          />
        ) : (
          <div className="wg-events">
            {events.map((e) => {
              const legs = JSON.parse(e.legsJson) as Array<{ symbol: string; amount: string }>;
              return (
                <div key={e.id} className="wg-event">
                  <span className="wg-event-when">{since(e.at)}</span>
                  <span className="wg-event-who">
                    <span className="mono">
                      {short(e.payer)} → {short(e.recipient)}
                    </span>
                    <span className="wg-event-reason">{e.reason}</span>
                  </span>
                  <span className="wg-event-legs">
                    {legs.map((l) => l.symbol).join(" · ")}
                  </span>
                  <span className="wg-event-value">
                    <Link href={`/receipt/${e.sig}`}>{usd(fromBase(BigInt(e.valueBase), 6))}</Link>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

function Stat({
  label,
  value,
  note,
  held,
}: {
  label: string;
  value: string | null;
  note?: string;
  held?: string | null;
}) {
  return (
    <div className="wg-stat">
      <p className="wg-stat-label">{label}</p>
      {value !== null ? (
        <p className="wg-stat-value">{value}</p>
      ) : (
        // A number we cannot compute is said in words, in the space where the number would
        // be. Never blank, and never a zero standing in for "we do not know".
        <p className="wg-stat-held">{held}</p>
      )}
      {note ? <p className="wg-stat-note">{note}</p> : null}
    </div>
  );
}
