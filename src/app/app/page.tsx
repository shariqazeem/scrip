import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { LiveBook } from "@/components/app/live-book";
import { PageFrame } from "@/components/app/page-frame";
import { FirstSteps, SavingsHead, SignInPanel } from "@/components/app/savings-home";
import { SignOut } from "@/components/auth/connect";
import { SavedList } from "@/components/save/saved-list";
import { defaultAsset } from "@/lib/assets/registry";
import { liveView } from "@/lib/book/live";
import { automaticToday, listOf } from "@/lib/save/card";
import { stockByMint } from "@/lib/save/catalogue";
import { readStockHoldings } from "@/lib/save/holdings";
import { savesFor } from "@/lib/save/index-saves";
import { nameOf } from "@/lib/save/names";
import { savingsTotals } from "@/lib/save/totals";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Your savings" };
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
    return (
      <PageFrame eyebrow="Scrip" title="Your savings" sub="Every stock you own, every save with its receipt, and saving every payment, in one place.">
        <SignInPanel />
      </PageFrame>
    );
  }

  const [view, saved, stocks, totals, auto] = await Promise.all([
    liveView(owner, { refresh: false }),
    savesFor(owner, 20),
    readStockHoldings(owner),
    savingsTotals(owner),
    automaticToday(),
  ]);
  const live = view.ok ? view.value : null;
  const hasRecord = live?.handle != null;
  const holdings = stocks.ok ? stocks.value : [];
  const firstMint = totals.first?.mint ?? null;
  const firstName = firstMint ? (stockByMint(firstMint)?.name ?? null) : null;
  const defaultName = nameOf(defaultAsset().symbol);
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
      <FirstSteps owner={owner} totals={totals} holdsStock={holdings.length > 0} firstName={firstName} hasRecord={hasRecord} defaultName={defaultName} automaticNote={automaticNote} />

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
