import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { LiveBook } from "@/components/app/live-book";
import { Wordmark } from "@/components/brand/wordmark";
import { Floor } from "@/components/floor/floor";
import { Mechanism, type SweepScene } from "@/components/landing/mechanism";
import { Reveal } from "@/components/motion/reveal";
import { Roll } from "@/components/motion/roll";
import { QrSvg } from "@/components/pay/qr-svg";
import { StubFromRow } from "@/components/stub/from-row";
import { ExampleStub } from "@/components/stub/stub";
import { USDC_MINT } from "@/lib/assets/registry";
import { resolveAssets } from "@/lib/assets/stand-in";
import { liveView } from "@/lib/book/live";
import { resolveHandle } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { bps, unitsFromRaw, usdc } from "@/lib/format";
import { validateSlug } from "@/lib/handle";
import { type ReceiptRow, keepRate } from "@/lib/keep-rate";
import { floorView } from "@/lib/floor";
import { allReceiptRows, ledgerTotals, recentReceipts } from "@/lib/ledger/indexer";
import { MIN_SLICE } from "@/lib/rule/slice";
import { cluster } from "@/lib/solana/cluster";
import { siteUrl } from "@/lib/site";
import "./landing.css";

export const dynamic = "force-dynamic";

/**
 * THE FRONT DOOR IS THE PRODUCT RUNNING, AS A FILM.
 *
 * It opens in the dark: a real book printing real receipts, the market on Solana moving on
 * a tape, and the last sweep replayed from its receipt, instruction by instruction. Then the
 * paper tears off and the document begins: what a share could never do before, each scene
 * with a real object entering as it is reached; the evidence; the honesty rows; the public
 * record with figures rolling to their real values. Nothing on the page is invented; only
 * the way it arrives is animated.
 */
export default async function LandingPage() {
  const site = siteUrl();
  const [totals, recent, rows, floor, front] = await Promise.all([ledgerTotals(), recentReceipts(24), allReceiptRows(), floorView(), frontBook()]);
  const mkt = floor.market;
  const labels = await resolveAssets(recent.map((r) => r.asset));
  const known = recent.filter((r) => labels.has(r.asset));
  const owners = [...new Set(known.map((r) => r.recipient))];
  const published = owners.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, published: books.published }).from(books).where(inArray(books.owner, owners)) : [];
  const handleOf = new Map(published.filter((b) => b.published === 1).map((b) => [b.owner, b.slug] as const));
  const resolve = (m: string) => labels.get(m) ?? null;
  const now = Math.floor(Date.now() / 1000);
  const rate7 = keepRate(rows.map(toRow), 7, now);

  const latestSweep = known.find((r) => r.kind === "sweep") ?? null;
  const latestPaid = known.find((r) => r.kind !== "sweep") ?? null;
  const latest = known[0] ?? null;
  const spy = mkt.rows.find((r) => r.symbol === "SPYx") ?? null;

  const scene: SweepScene = latestSweep
    ? {
        basisUsdc: String(latestSweep.basisUsdc),
        paidUsdc: String(latestSweep.paidUsdc),
        rateBps: latestSweep.rateBps,
        units: unitsFromRaw(BigInt(latestSweep.amountRaw), labels.get(latestSweep.asset)!.decimals),
        symbol: labels.get(latestSweep.asset)!.symbol,
        handle: handleOf.get(latestSweep.recipient) ?? null,
        sig: latestSweep.sig,
        real: true,
      }
    : {
        basisUsdc: "100000000",
        paidUsdc: String(Math.round((100_000_000 * (front?.rateNowBps ?? 1_000)) / 10_000)),
        rateBps: front?.rateNowBps ?? 1_000,
        units: spy?.priceUsd ? (((100 * (front?.rateNowBps ?? 1_000)) / 10_000) / spy.priceUsd).toFixed(4) : "—",
        symbol: "SPYx",
        handle: front?.handle ?? null,
        sig: null,
        real: false,
      };

  const payHref = front ? `/pay/${front.handle}` : "/app/org/pay";
  const latestGift = floor.tape.find((r) => r.kind === "gift") ?? null;
  const latestGrant = floor.tape.find((r) => r.kind === "grant") ?? null;
  const latestWithReason = floor.tape.find((r) => r.reason) ?? null;
  const sevens = [
    { n: "01", title: "It can be paid", body: "A stock arrives as a payment: pay a person or a whole team in the S&P 500, to their own wallet, with no brokerage account on either side.", href: latestPaid ? `/receipt/${latestPaid.sig}` : payHref, go: latestPaid ? "The latest payment in stock" : "Pay someone in stock" },
    { n: "02", title: "It obeys a rule on an address", body: "A standing instruction on the account money already lands in. Ten percent by default; a signature to start; a revoke to stop.", href: latestSweep ? `/receipt/${latestSweep.sig}` : "/app/rule", go: latestSweep ? "The latest sweep" : "Turn on the rule" },
    { n: "03", title: "It remembers why it arrived", body: "Every receipt carries the reason, from whom, at which price, and whether it is still held at 7 and 30 days.", href: latestWithReason ? `/receipt/${latestWithReason.sig}` : "/docs/receipts", go: latestWithReason ? `“${latestWithReason.reason.slice(0, 40)}${latestWithReason.reason.length > 40 ? "…" : ""}”` : "How receipts work" },
    { n: "04", title: "It vests, from anyone to anyone", body: "A grant is stock bought now that releases on a schedule: the retention instrument public companies use, in any listed company, from any organisation.", href: latestGrant ? `/receipt/${latestGrant.sig}` : "/grants", go: latestGrant ? "The latest grant" : "Grants that vest" },
    { n: "05", title: "It arrives at 3am on a Sunday", body: floor.slept.total > 0 ? `${bps(floor.slept.bps)} of arrivals here settled while the NYSE was shut. Solana does not close.` : "The NYSE keeps hours; Solana does not. The floor counts every arrival that settled while the exchange was shut.", href: "#floor", go: "The clock on the floor" },
    { n: "06", title: "It lands in an empty wallet", body: "A first share can be given to an address that has never held anything, and claimed with the fee paid.", href: latestGift ? `/receipt/${latestGift.sig}` : payHref, go: latestGift ? "The latest first share" : "Give a first share" },
    { n: "07", title: "It proves it was kept", body: "Keep-rate is measured on chain at 7 and 30 days from raw units, by anyone. It cannot be faked.", href: "/ledger", go: floor.keepRate7 ? `${bps(floor.keepRate7.bps)} kept at 7 days` : "The ledger" },
  ];
  const sendUsd = front ? Math.max(5, Math.ceil(Number(MIN_SLICE) / 1e6 / Math.max(front.rateNowBps, 1) / 1e-4)) : 5;
  const onMainnet = cluster() === "mainnet-beta";
  const payQr = front && onMainnet ? `solana:${front.owner}?amount=${sendUsd}&spl-token=${USDC_MINT}&label=${encodeURIComponent(`Scrip @${front.handle}`)}&message=${encodeURIComponent("Watch it become stock on Scrip")}` : null;

  return (
    <div className="sp-landing">
      {/* ── the dark opening: nav, hero, the tape ─────────────────────────── */}
      <div className="sp-dark">
        <nav className="sp-nav">
          <Link href="/" className="sp-nav-brand" aria-label="Scrip home">
            <Wordmark size={22} />
          </Link>
          <Link href={payHref} className="sp-nav-link">
            Pay someone
          </Link>
          <Link href="/ledger" className="sp-nav-link">
            Ledger
          </Link>
          <Link href="/keepers" className="sp-nav-link">
            Keepers
          </Link>
          <Link href="/docs" className="sp-nav-link">
            Docs
          </Link>
          <Link href="/app/rule" className="sp-btn is-primary">
            Turn on the rule
          </Link>
        </nav>

        <header className="sp-sec sp-hero">
          <div className="sp-hero-copy">
            <p className="sp-kicker is-live">
              <span className="dot" aria-hidden />
              Live on Solana {onMainnet ? "mainnet" : cluster()}
            </p>
            <h1 className="sp-display">
              Your income
              <br />
              invests itself.
            </h1>
            <p className="sp-lede">
              Set a rate once on the wallet you already get paid to. A slice of every USDC that lands becomes S&amp;P 500 in the same
              wallet, seconds later, with a receipt anyone can open.
            </p>
            <div className="sp-hero-cta">
              <Link href="/app/rule" className="sp-btn is-primary">
                Turn on the rule
              </Link>
              <Link href={payHref} className="sp-btn is-ghost">
                Pay someone in stock
              </Link>
            </div>
            <p className="sp-hero-note">Payers never open Scrip. Pausing is a token-program revoke that Scrip cannot prevent. Ten percent by default; one signature to start.</p>
          </div>

          <aside className="sp-hero-stub" aria-label={front ? `@${front.handle}, live` : latest ? "The latest receipt" : "A worked example"}>
            {front ? (
              <LiveBook initial={front} mode="front" site={site} limit={2}>
                <div className="sp-front-try">
                  {payQr ? (
                    <>
                      <QrSvg text={payQr} size={112} label={`Send @${front.handle} $${sendUsd} with a phone wallet`} />
                      <div>
                        <p className="sp-front-try-h">Send this wallet ${sendUsd} and watch.</p>
                        <p className="sp-front-try-p">
                          Scan with any Solana wallet. A normal USDC transfer to a normal address; within seconds {bps(front.rateNowBps)} of it is{" "}
                          {front.asset?.symbol ?? "stock"} here, with a receipt. <Link href={`/@${front.handle}`}>Open the page.</Link>
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="sp-front-try-h">A real book on {cluster()}, watched live.</p>
                      <p className="sp-front-try-p">
                        {bps(front.rateNowBps)} of every arrival at <span className="mono">{front.owner.slice(0, 8)}…</span> becomes {front.asset?.symbol ?? "stock"}, with a
                        receipt. <Link href={`/@${front.handle}`}>Open the page.</Link>
                      </p>
                    </div>
                  )}
                </div>
              </LiveBook>
            ) : latest ? (
              <div className="sp-front-book">
                <div className="stub-printer">
                  <span className="live">
                    <span className="dot" aria-hidden />
                    the latest receipt
                  </span>
                  <span>Scrip</span>
                </div>
                <div className="stub-stack is-printed">
                  <StubFromRow row={latest} handle={handleOf.get(latest.recipient) ?? null} compact resolve={resolve} printing />
                </div>
              </div>
            ) : (
              <ExampleStub />
            )}
          </aside>
        </header>

        {/* ── the floor: the clock, the tape, keepers, corporate actions, the market ── */}
        <section className="sp-sec sp-scene" id="floor">
          <p className="sp-kicker">The floor</p>
          <h2 className="sp-h2">There is no opening bell.</h2>
          <Floor view={floor} />
        </section>

        {/* ── the mechanism: the last sweep, replayed ─────────────────────── */}
        <section className="sp-sec sp-scene">
          <p className="sp-kicker">What happens when money lands</p>
          <h2 className="sp-h2">A payment arrives. A rule runs. A receipt prints.</h2>
          <Reveal className="sp-reveal">
            <Mechanism scene={scene} />
          </Reveal>
        </section>
      </div>

      {/* ── the paper tears off ─────────────────────────────────────────────── */}
      <div className="sp-tear" aria-hidden />

      <section className="sp-sec">
        <Reveal className="sp-reveal is-line">
          <p className="sp-line">You&rsquo;re already getting paid. Investing shouldn&rsquo;t take another decision.</p>
        </Reveal>
      </section>

      {/* ── the seven firsts: what a stock could never do before, each linked to where it happened ── */}
      <section className="sp-sec">
        <p className="sp-kicker">What a stock could never do before</p>
        <h2 className="sp-h2">Seven things a brokerage share never did, each one on the floor today.</h2>
        <Reveal className="sp-sevens">
          {sevens.map((f) => (
            <Link key={f.n} href={f.href} className="sp-seven">
              <span className="n">{f.n}</span>
              <span className="t">{f.title}</span>
              <span className="p">{f.body}</span>
              <span className="go">{f.go}</span>
            </Link>
          ))}
        </Reveal>
      </section>

      {/* ── the evidence, as bars ──────────────────────────────────────────── */}
      <section className="sp-sec">
        <p className="sp-kicker">The evidence</p>
        <h2 className="sp-h2">A rule on income is the only version that has ever worked at scale.</h2>
        <Reveal className="sp-bars">
          <figure className="sp-bar">
            <figcaption>
              <span className="t">401(k) participation among new hires, after automatic enrollment</span>
              <span className="s">Madrian &amp; Shea, 2001</span>
            </figcaption>
            <div className="sp-bar-row">
              <span className="k">before</span>
              <span className="track">
                <span className="fill" style={{ "--fill": "37%" } as React.CSSProperties} />
              </span>
              <span className="v">
                <Roll value={37} kind="pct" />
              </span>
            </div>
            <div className="sp-bar-row is-after">
              <span className="k">after</span>
              <span className="track">
                <span className="fill" style={{ "--fill": "86%" } as React.CSSProperties} />
              </span>
              <span className="v">
                <Roll value={86} kind="pct" />
              </span>
            </div>
          </figure>
          <figure className="sp-bar">
            <figcaption>
              <span className="t">Saving rate when contribution increases were tied to pay raises, over forty months</span>
              <span className="s">Thaler &amp; Benartzi, 2004</span>
            </figcaption>
            <div className="sp-bar-row">
              <span className="k">before</span>
              <span className="track">
                <span className="fill" style={{ "--fill": "17.5%" } as React.CSSProperties} />
              </span>
              <span className="v">
                <Roll value={3.5} kind="pct1" />
              </span>
            </div>
            <div className="sp-bar-row is-after">
              <span className="k">after</span>
              <span className="track">
                <span className="fill" style={{ "--fill": "68%" } as React.CSSProperties} />
              </span>
              <span className="v">
                <Roll value={13.6} kind="pct1" />
              </span>
            </div>
          </figure>
        </Reveal>
        <p className="sp-body">Every consumer version since needs a US bank and a US brokerage. On Solana the wallet is the paycheck account for everyone paid in stablecoins, and nobody had put a rule on it.</p>
      </section>

      {/* ── before you ask ─────────────────────────────────────────────────── */}
      <section className="sp-sec">
        <p className="sp-kicker">Before you ask</p>
        <h2 className="sp-h2">The things a savings product should say first.</h2>
        <Reveal className="sp-truths">
          <div className="sp-truth">
            <span className="k">Not our custody</span>
            <p className="v">Your USDC and your stock sit in token accounts you own. Scrip holds a rule and writes receipts; it never holds an asset across a slot.</p>
          </div>
          <div className="sp-truth">
            <span className="k">The issuer can move these tokens</span>
            <p className="v">xStocks are tracker certificates issued by Backed, with a permanent delegate and a pause authority. Self-custody here means not our custody. Not offered to US persons.</p>
          </div>
          <div className="sp-truth">
            <span className="k">Dividends are reinvested, not paid</span>
            <p className="v">They arrive as a mint-level multiplier that rebases balances. Scrip never shows an expected income.</p>
          </div>
          <div className="sp-truth">
            <span className="k">Net, not gross</span>
            <p className="v">The rule sees the net increase of your USDC account since the last sweep. Money spent before a keeper acts is not taxed.</p>
          </div>
          <div className="sp-truth">
            <span className="k">Savings-grade, not stable</span>
            <p className="v">Equities fall as well as rise. Scrip competes for the position that sits idle, never for your cash.</p>
          </div>
        </Reveal>
      </section>

      {/* ── the public record ──────────────────────────────────────────────── */}
      <section className="sp-sec">
        <p className="sp-kicker">The public record</p>
        <h2 className="sp-h2">Everything that has settled, and how much of it is still held.</h2>
        <Reveal className="sp-strip">
          <div>
            <p className="sp-strip-label">Receipts</p>
            <p className="sp-strip-value">
              <Roll value={totals.receipts} kind="int" />
            </p>
          </div>
          <div>
            <p className="sp-strip-label">Converted</p>
            <p className="sp-strip-value">
              <Roll value={Number(totals.paidUsdc) / 1e6} kind="usd" />
            </p>
          </div>
          <div>
            <p className="sp-strip-label">Wallets with the rule on</p>
            <p className="sp-strip-value">
              <Roll value={totals.rulesOn} kind="int" />
            </p>
          </div>
          <div>
            <p className="sp-strip-label">Keep-rate at 7 days</p>
            {rate7.ok ? (
              <p className="sp-strip-value">
                <Roll value={rate7.value.bps / 100} kind="pct2" />
              </p>
            ) : (
              <p className="sp-strip-held">{rate7.why}</p>
            )}
          </div>
        </Reveal>
        {known.length > 0 ? (
          <Reveal className="sp-wall">
            {known.slice(0, 3).map((r, i) => (
              <div key={r.id} className="sp-wall-item" style={{ "--i": i } as React.CSSProperties}>
                <StubFromRow row={r} handle={handleOf.get(r.recipient) ?? null} compact resolve={resolve} printing />
              </div>
            ))}
          </Reveal>
        ) : null}
        <p className="sp-hero-note">
          <Link href="/ledger" className="sp-inline-link">
            Open the ledger
          </Link>
          . Every stub is an account anyone can read, anchored to a transaction that already happened.
        </p>
      </section>

      {/* ── the close ──────────────────────────────────────────────────────── */}
      <div className="sp-dark sp-close">
        <div className="sp-sec">
          <Reveal className="sp-reveal is-line">
            <p className="sp-line">Set a rate once. Then get paid.</p>
            <div className="sp-hero-cta">
              <Link href="/app/rule" className="sp-btn is-primary">
                Turn on the rule
              </Link>
              <Link href={payHref} className="sp-btn is-ghost">
                Pay someone in stock
              </Link>
            </div>
            <p className="sp-hero-note">
              {front ? `${usdc(BigInt(front.usdc.balance))} sits at @${front.handle} right now, watched. ` : ""}
              Ten percent by default. Pausing is a revoke. Every receipt is an account anyone can open.
            </p>
          </Reveal>
        </div>
        <footer className="sp-foot">
          <span>Scrip</span>
          <span className="sp-foot-spacer" />
          <Link href="/assets">Assets</Link>
          <Link href="/ledger">Ledger</Link>
          <Link href="/keepers">Keepers</Link>
          <Link href="/docs">Docs</Link>
        </footer>
      </div>
    </div>
  );
}

/**
 * The front book: a published book named by NEXT_PUBLIC_FRONT_BOOK, or nothing.
 *
 * Everybody who opens Scrip lands on this one register, so its view is held for a few
 * seconds and shared: the first visitor of each window pays the chain reads and the rest are
 * served from memory. The printer on the page then polls every four seconds like any other
 * register, which is where the liveness actually comes from.
 */
async function frontBook() {
  const raw = process.env.NEXT_PUBLIC_FRONT_BOOK?.trim();
  if (!raw) return null;
  const slug = validateSlug(raw);
  if (!slug.ok) return null;
  const owner = await resolveHandle(slug.value);
  if (!owner.ok || !owner.value) return null;
  const row = (await db.select({ published: books.published }).from(books).where(eq(books.owner, owner.value)).limit(1))[0];
  if (!row || row.published !== 1) return null;
  const view = await liveView(owner.value, { refresh: false });
  return view.ok ? view.value : null;
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
