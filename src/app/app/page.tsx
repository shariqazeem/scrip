import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { LiveBook } from "@/components/app/live-book";
import { PageFrame } from "@/components/app/page-frame";
import { FirstSteps, SavingsHead, SignInPanel } from "@/components/app/savings-home";
import { SignOut } from "@/components/auth/connect";
import { PlanMemberships } from "@/components/plan/memberships";
import { SavedList } from "@/components/save/saved-list";
import { StartCard } from "@/components/start/start-card";
import { liveView } from "@/lib/book/live";
import { membershipsOf } from "@/lib/plan/read";
import { automaticToday, listOf } from "@/lib/save/card";
import { readStockHoldings } from "@/lib/save/holdings";
import { savesFor } from "@/lib/save/index-saves";
import { savingsTotals } from "@/lib/save/totals";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";
import { startCardProps } from "@/lib/start/card";
import { cluster } from "@/lib/solana/cluster";

export const metadata: Metadata = {
  title: "Your savings",
  description: "Every stock you own, every save with its receipt, and saving every payment, in one place. Start saving with one approval, in your own Solana wallet.",
};
export const dynamic = "force-dynamic";

/**
 * YOUR SAVINGS — the first screen of the app.
 *
 * In the order a person asks: what do I own, and what do I do next. Then, for a wallet that
 * has set up saving every payment, the live record (polled every four seconds, where an
 * automatic save prints as it lands); then every save this wallet made by hand.
 *
 * Signed out, it is a door, not an empty page: what is inside, the one way in, and the way to
 * start for somebody who has never saved.
 */
export default async function HomePage() {
  const owner = await currentOwner();
  if (!owner) {
    // Already saving: sign in. New: the start card, the same one as the front door.
    const start = await startCardProps();
    return (
      <PageFrame eyebrow="Scrip" title="Your savings" sub="Every stock you own, every save with its receipt, and saving every payment, in one place.">
        <SignInPanel />
        <section className="sp-start-panel" aria-labelledby="new-here">
          <h2 id="new-here">New to Scrip? Start here.</h2>
          <StartCard {...start} compact />
        </section>
      </PageFrame>
    );
  }

  const [view, saved, stocks, savedTotals, auto, plans, start] = await Promise.all([
    liveView(owner, { refresh: false }),
    savesFor(owner, 20),
    readStockHoldings(owner),
    savingsTotals(owner),
    automaticToday(),
    membershipsOf(owner),
    startCardProps(),
  ]);
  // A Plan's matches are not receipts: they are read from the Member account the program keeps,
  // and counted with everything else somebody added.
  const memberships = plans.ok ? plans.value : [];
  const matchedUsdc = memberships.reduce((n, r) => n + r.member.totalMatchedUsdc, 0n);
  const totals = { ...savedTotals, addedUsdc: savedTotals.addedUsdc + matchedUsdc, added: savedTotals.added + (matchedUsdc > 0n ? 1 : 0) };
  const inPlan = memberships.some((r) => r.member.status === "active");
  const live = view.ok ? view.value : null;
  const hasRecord = live?.handle != null;
  const holdings = stocks.ok ? stocks.value : [];
  // Said only while it is true: an automatic save settles against a price the program can
  // verify, and today that is a short list.
  const automaticNote =
    auto.known && auto.defaultSettles === false
      ? auto.settling.length > 0
        ? `Right now automatic saves settle into the ${listOf(auto.settling)}; other stocks wait for a price.`
        : "Right now automatic saves are waiting for a price; payments stay in your wallet as USDC until one returns."
      : null;

  return (
    <PageFrame eyebrow={live?.handle ? `@${live.handle}` : "Scrip"} title="Your savings" actions={<SignOut />}>
      <SavingsHead holdings={holdings} totals={totals} why={stocks.ok ? null : stocks.why} />
      <PlanMemberships owner={owner} cluster={cluster()} rows={memberships} hasRecord={hasRecord} />
      {hasRecord ? (
        <FirstSteps owner={owner} totals={totals} hasRecord={hasRecord} automaticNote={automaticNote} inPlan={inPlan} />
      ) : (
        // Nothing set up yet: the one thing to do is start, and the card does all of it at once.
        <section className="sp-start-panel" aria-labelledby="start-here">
          <h2 id="start-here">Start saving</h2>
          <StartCard {...start} compact />
        </section>
      )}

      {!view.ok ? (
        <div className="sp-held">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          <span>{view.why}</span>
        </div>
      ) : live && (hasRecord || live.arrivals.length > 0) ? (
        <LiveBook initial={live} mode="owner" site={siteUrl()} hideHoldings hideHead={!hasRecord} />
      ) : null}

      {saved.length > 0 ? (
        <section className="sp-section sp-saved-section" aria-label="Saved now">
          <p className="sp-section-label">
            <span>Saved now</span>
            <Link href="/app/save">save again</Link>
          </p>
          <SavedList rows={saved} />
        </section>
      ) : null}
    </PageFrame>
  );
}
