import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { desc, eq, inArray } from "drizzle-orm";
import { ScripMark } from "@/components/brand/scrip-mark";
import { GrantBar } from "@/components/org/grant-bar";
import { StubFromRow } from "@/components/stub/from-row";
import { readGrantAt } from "@/lib/book/read-grant";
import { db } from "@/lib/db";
import { books, grants, receipts } from "@/lib/db/schema";
import { dateUTC, short, sol, unitsFromRaw, usdc } from "@/lib/format";
import { cluster } from "@/lib/solana/cluster";
import "../../pay/pay.css";
import "@/styles/app.css";
import "@/components/org/org.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pda } = await params;
  return { title: `Grant ${pda.slice(0, 6)}`, description: "Stock that vests on a schedule, from anyone to anyone, with a receipt at every vest." };
}

/**
 * A GRANT — the schedule as a ruled timeline, what has vested, the next vest, and every
 * receipt it has written. Read from the chain; the reason and the handles from the cache.
 */
export default async function GrantPage({ params }: Params) {
  const { pda } = await params;
  let key: PublicKey;
  try {
    key = new PublicKey(pda);
  } catch {
    notFound();
  }
  const now = Math.floor(Date.now() / 1000);
  const g = await readGrantAt(key, undefined, now);
  if (!g.ok) {
    return (
      <Frame>
        <h1 className="sp-pay-h1">This grant could not be read.</h1>
        <p className="sp-pay-lede">{g.why}</p>
      </Frame>
    );
  }
  if (!g.value) {
    return (
      <Frame>
        <h1 className="sp-pay-h1">There is no grant at that address.</h1>
        <p className="sp-pay-lede">It may have been closed: a completed or revoked grant returns its rent to the payer.</p>
      </Frame>
    );
  }
  const v = g.value;
  const [cached] = await db.select({ reason: grants.reason }).from(grants).where(eq(grants.pda, pda)).limit(1);
  const rows = await db.select().from(receipts).where(eq(receipts.book, pda)).orderBy(desc(receipts.settledUnix));
  const people = await db.select({ owner: books.owner, slug: books.slug, published: books.published, kind: books.kind }).from(books).where(inArray(books.owner, [v.payer, v.recipient]));
  const payerRow = people.find((p) => p.owner === v.payer);
  const recipientRow = people.find((p) => p.owner === v.recipient && p.published === 1);
  const decimals = v.asset_?.decimals ?? null;
  const symbol = v.asset_?.symbol ?? "units";
  const units = (raw: bigint) => (decimals !== null ? unitsFromRaw(raw, decimals) : raw.toString());
  const resolve = (m: string) => (v.asset_ && v.asset_.mint === m ? v.asset_ : null);

  return (
    <Frame>
      <div className="sp-org">
        <header className="sp-org-head">
          <p className="sp-page-eyebrow">
            A grant from <Link href={`/@${payerRow?.slug ?? v.payer}`}>{payerRow?.slug ? `@${payerRow.slug}` : short(v.payer)}</Link> to{" "}
            {recipientRow ? <Link href={`/@${recipientRow.slug}`}>@{recipientRow.slug}</Link> : <span className="mono">{short(v.recipient)}</span>}
          </p>
          <h1 className="sp-org-h1">
            {units(v.totalRaw)} {symbol}, vesting {v.durationSecs > 0 ? `over ${Math.round(v.durationSecs / 86_400)} days` : "at the cliff"}
            {v.cliffSecs > 0 ? ` after a ${Math.round(v.cliffSecs / 86_400)}-day cliff` : ""}.
          </h1>
          <p className="sp-org-lede">
            {cached?.reason ? `“${cached.reason}”. ` : ""}
            Bought for {usdc(v.declaredUsdc)} on {dateUTC(v.createdUnix)}. It sits in an escrow the payer created, that the recipient can see, and that the payer cannot spend. While it vests, dividends reinvest into it.
          </p>
        </header>

        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>The schedule</span>
            <span>{v.state === "active" ? (v.sealed ? "active" : "not sealed") : v.state}</span>
          </p>
          <GrantBar totalRaw={v.totalRaw} releasedRaw={v.releasedRaw} startUnix={v.startUnix} cliffSecs={v.cliffSecs} durationSecs={v.durationSecs} now={now} />
          <div className="sp-org-facts">
            <Fact k="Vested so far" v={`${units(v.releasedRaw)} ${symbol}`} note={`${v.vests} vest${v.vests === 1 ? "" : "s"}`} />
            <Fact k="Still in escrow" v={`${units(v.escrowRaw)} ${symbol}`} />
            <Fact k="Releasable now" v={`${units(v.releasableNow)} ${symbol}`} note={v.releasableNow > 0n ? "any keeper may vest it" : undefined} />
            <Fact k="Next vest" v={v.nextVestUnix === null ? "none" : v.nextVestUnix <= now ? "continuous" : dateUTC(v.nextVestUnix)} />
            <Fact k="Float for vests" v={sol(v.floatLamports)} note="pays each vest's receipt and tip" />
            <Fact k="Revocable" v={v.revocable ? "yes, unvested only" : "no"} />
          </div>
        </section>

        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Receipts</span>
            <span>{rows.length}</span>
          </p>
          {rows.length === 0 ? (
            <p className="sp-register-empty">The grant&rsquo;s own receipt appears here once the indexer sees it, and one more for every vest.</p>
          ) : (
            <div className="stub-wall">
              {rows.map((r) => (
                <StubFromRow key={r.id} row={r} handle={recipientRow?.slug ?? null} compact resolve={resolve} />
              ))}
            </div>
          )}
        </section>
        <p className="sp-fact-note">
          Grant account <span className="mono">{pda}</span>. Escrow owner: the grant itself. The program moves units only on the schedule, to the recipient, or the unvested part back to the payer on a revoke.
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="sp-pay">
      <div className="sp-pay-col">
        <div className="sp-pay-top">
          <Link href="/" className="sp-pay-brand" aria-label="Scrip">
            <ScripMark size={20} />
            Scrip
          </Link>
          <span className="mono">{cluster() === "mainnet-beta" ? "Solana" : cluster()}</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="sp-ledger-fact">
      <p className="k">{k}</p>
      <p className="v">{v}</p>
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}
