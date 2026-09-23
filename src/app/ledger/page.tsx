import type { Metadata } from "next";
import { outsideTeam } from "@/lib/team";
import Link from "next/link";
import { after } from "next/server";
import { inArray } from "drizzle-orm";
import { PageFrame } from "@/components/app/page-frame";
import { StubFromRow } from "@/components/stub/from-row";
import { EmptyStub } from "@/components/stub/stub";
import { resolveAssets } from "@/lib/assets/stand-in";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { bps, dateUTC, unitsFromRaw, usdc } from "@/lib/format";
import { type ReceiptRow, WINDOWS, firstMaturity, keepRate } from "@/lib/keep-rate";
import { allReceiptRows, indexBooks, indexGrants, indexReceipts, ledgerTotals, recentReceipts, refreshMeasurements, unitsByAsset } from "@/lib/ledger/indexer";
import "@/components/app/live.css";

export const metadata: Metadata = {
  title: "Ledger",
  description: "Everything Scrip has settled: sweeps and payments, value converted, units delivered, wallets with the rule on, and keep-rate measured on chain at 7 and 30 days.",
};
export const dynamic = "force-dynamic";

/**
 * THE PUBLIC RECORD — a wall of stubs, newest first, and the aggregates above them.
 *
 * Every stub is a receipt account anyone can open. What is NOT here is a searchable balance
 * with somebody's name on it; a handle appears only where its owner published the book.
 */
export default async function LedgerPage() {
  const [totals, events, rows, units] = await Promise.all([ledgerTotals(), recentReceipts(48), allReceiptRows(), unitsByAsset()]);
  const labels = await resolveAssets([...events.map((e) => e.asset), ...units.map((u) => u.asset)]);
  const assetByMint = (mint: string) => labels.get(mint) ?? null;
  const owners = [...new Set(events.map((e) => e.recipient))];
  const rowsOf = owners.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, published: books.published }).from(books).where(inArray(books.owner, owners)) : [];
  // A handle is named on the wall only where its owner published the book.
  const handleOf = new Map(rowsOf.filter((b) => b.published === 1).map((b) => [b.owner, b.slug] as const));

  // Refresh the cache AFTER the response, so a slow RPC never makes this page slow.
  after(async () => {
    await indexReceipts();
    await indexBooks();
    await indexGrants();
    await refreshMeasurements();
  });

  const now = Math.floor(Date.now() / 1000);
  const asRows = rows.map(toRow);
  const outside = outsideTeam(rows);
  const rates = WINDOWS.map((w) => ({ w, rate: keepRate(asRows, w, now), first: firstMaturity(asRows, w, now) }));
  const registered = units.filter((u) => assetByMint(u.asset));
  const unregistered = units.filter((u) => !assetByMint(u.asset));

  return (
    <PageFrame eyebrow="Public record" title="Everything that has settled, and how much of it is still held." sub="Fed by receipts read off the chain and nothing else. Every stub is an account anyone can open, anchored to a transaction that already happened.">
      <div className="sp-live">
        <section className="sp-section">
          <p className="sp-section-label">
            <span>The aggregates</span>
            <Link href="/docs/keep-rate">how keep-rate is measured</Link>
          </p>
          <div className="sp-ledger-facts">
            <Fact k="Receipts" v={totals.receipts.toLocaleString("en-US")} note={`${totals.sweeps.toLocaleString("en-US")} sweeps, ${(totals.receipts - totals.sweeps).toLocaleString("en-US")} payments`} />
            <Fact
              k="To wallets outside the team"
              v={outside.receipts.toLocaleString("en-US")}
              note={`${outside.wallets} wallet${outside.wallets === 1 ? "" : "s"}. The team's own are named on /security and marked "team" on their stubs`}
            />
            <Fact k="Value converted" v={usdc(totals.paidUsdc)} note="the slices and the payments, at the dollars that went in" />
            <Fact
              k="Units delivered"
              v={registered.length > 0 ? registered.map((u) => `${unitsFromRaw(u.amountRaw, assetByMint(u.asset)!.decimals)} ${assetByMint(u.asset)!.symbol}`).join(" · ") : units.length === 0 ? "0" : null}
              held={registered.length === 0 && unregistered.length > 0 ? `${unregistered.reduce((n, u) => n + Number(u.count), 0)} receipts in mints not on the registry.` : null}
              note={unregistered.length > 0 && registered.length > 0 ? "plus receipts in mints not on the registry, not counted" : "raw units, as the token accounts hold them"}
            />
            <Fact k="Wallets with the rule on" v={totals.rulesOn.toLocaleString("en-US")} note={`${totals.books.toLocaleString("en-US")} books opened`} />
            {rates.map(({ w, rate, first }) => (
              <Fact
                key={w}
                k={`Keep-rate at ${w} days`}
                v={rate.ok ? bps(rate.value.bps) : null}
                held={rate.ok ? null : first ? `The first receipt is ${w} days old on ${dateUTC(first)}.` : rate.why}
                note={rate.ok ? `over ${rate.value.receipts} receipt${rate.value.receipts === 1 ? "" : "s"} and ${rate.value.recipients} wallet${rate.value.recipients === 1 ? "" : "s"}` : undefined}
              />
            ))}
          </div>
        </section>

        <section className="sp-section">
          <p className="sp-section-label">
            <span>Settled, newest first</span>
            {events.length > 0 ? <span>{events.length} most recent</span> : null}
          </p>
          {events.length === 0 ? (
            <EmptyStub note="This wall is fed by receipts read off the chain. The first sweep or payment to settle prints here with a link anyone can open." />
          ) : (
            <div className="stub-wall">
              {events.map((e) => (
                <StubFromRow key={e.id} row={e} handle={handleOf.get(e.recipient) ?? null} compact showHeld resolve={assetByMint} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function Fact({ k, v, note, held }: { k: string; v: string | null; note?: string; held?: string | null }) {
  return (
    <div className="sp-ledger-fact">
      <p className="k">{k}</p>
      {v !== null ? <p className="v">{v}</p> : <p className="held">{held}</p>}
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}

function toRow(r: Awaited<ReturnType<typeof allReceiptRows>>[number]): ReceiptRow {
  return {
    recipient: r.recipient,
    asset: r.asset,
    settledUnix: r.settledUnix,
    paidUsdc: BigInt(r.paidUsdc),
    amountRaw: BigInt(r.amountRaw),
    measured7dRaw: r.measured7dAt === 0 ? null : BigInt(r.measured7dRaw),
    measured30dRaw: r.measured30dAt === 0 ? null : BigInt(r.measured30dRaw),
  };
}
