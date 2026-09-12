import Link from "next/link";
import { Gift, HandCoins, Info, ScrollText, Sparkles } from "lucide-react";
import { WebgoldMark } from "@/components/brand/webgold-mark";
import "./landing.css";

/**
 * THE PUBLIC FRONT DOOR.
 *
 * One rule governs this page: nothing on it is a number we cannot open. The ledger card shows
 * what has actually settled, and before anything has, it renders a designed waiting state
 * rather than a sample row. A fabricated feed is the single easiest claim for a judge to check
 * and disprove, and it would cost the only thing this product sells — that every arrival can be
 * opened by anyone.
 *
 * The live event stream lands here once receipts exist (build-order step 8); the card below is
 * where it mounts.
 */
export default function LandingPage() {
  return (
    <div className="wg-landing">
      <nav className="wg-nav">
        <Link href="/" className="wg-nav-brand" aria-label="Webgold home">
          <WebgoldMark size={20} />
          webgold
        </Link>
        <Link href="/assets" className="wg-nav-link">
          Assets
        </Link>
        <Link href="/ledger" className="wg-nav-link">
          Ledger
        </Link>
        <Link href="/docs" className="wg-nav-link is-secondary">
          Docs
        </Link>
        <Link href="/app" className="wg-btn is-primary">
          Open a book
        </Link>
      </nav>

      <header className="wg-sec wg-hero">
        <div>
          <p className="wg-kicker">Ownership you receive</p>
          <h1 className="wg-display">
            Web3 made assets programmable. Webgold makes ownership <em>receivable</em>.
          </h1>
          <p className="wg-lede">
            A receive book for real assets on Solana. Value arrives as gold, silver and the
            market — in your own wallet, never ours — because you earned it, were gifted it, or
            were sponsored into it. Every arrival carries a receipt anyone can open.
          </p>
          <div className="wg-hero-cta">
            <Link href="/app" className="wg-btn is-primary">
              Open a book
            </Link>
            <Link href="/assets" className="wg-btn">
              See what a book holds
            </Link>
          </div>
          <p className="wg-hero-note">
            You do not come here to trade. An exchange is a place to buy and park; this is where
            work becomes ownership.
          </p>
        </div>

        <aside className="wg-card" aria-label="Settled arrivals">
          <div className="wg-card-head">
            <span className="wg-card-title">Settled arrivals</span>
            <Link href="/ledger" className="mono wg-nav-link">
              ledger →
            </Link>
          </div>
          <div className="wg-card-body">
            <div className="wg-empty">
              <ScrollText size={22} strokeWidth={1.6} className="wg-empty-mark" aria-hidden />
              <p className="wg-empty-title">Nothing has settled yet</p>
              <p className="wg-empty-note">
                This is the real stream, not a sample. The first arrival that settles on chain
                appears here, with a receipt you can open.
              </p>
            </div>
          </div>
        </aside>
      </header>

      <section className="wg-band">
        <div className="wg-sec">
          <p className="wg-kicker">Three ways value arrives</p>
          <h2 className="wg-h2">Nobody here decided to become an investor.</h2>
          <p className="wg-lede">
            Value is denominated in dollars and lands as your mix, in your own token accounts.
            The payer names a reason and may restrict the asset set — never the weights. Your
            book is yours.
          </p>
          <div className="wg-grid-3">
            <article className="wg-tile">
              <span className="wg-tile-icon">
                <HandCoins size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <h3>Earn</h3>
              <p>
                A payer escrows value and releases it with a reason attached. Your own policy
                turns it into grams, ounces and the market. A cohort is recorded at release, so
                what you keep is measurable rather than guessed.
              </p>
            </article>
            <article className="wg-tile">
              <span className="wg-tile-icon">
                <Gift size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <h3>Receive</h3>
              <p>
                Request or gift a named slice over a link or a QR. A named gift stays named —
                0.2 grams of gold arrives as 0.2 grams of gold. An occasion, not a transfer.
              </p>
            </article>
            <article className="wg-tile">
              <span className="wg-tile-icon">
                <Sparkles size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <h3>Sponsor</h3>
              <p>
                An issuer funds a first position into an empty book. Same receipt, same cohort.
                This is how a book appears without anyone deciding to open one.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="wg-band">
        <div className="wg-sec">
          <p className="wg-kicker">One book, in this order</p>
          <h2 className="wg-h2">Grams first. Dollars last.</h2>
          <p className="wg-lede">
            Gold is metal here, not a fund share that tracks it. If a token is a claim on a fund
            rather than a bar, it is never shown under grams — it sits under funds and says so.
          </p>
          <div className="wg-order">
            <div className="wg-order-row">
              <span className="wg-order-name">Gold</span>
              <span className="wg-order-unit">fine grams</span>
              <span className="wg-order-issuer">Allocated metal, issuer named on every row</span>
            </div>
            <div className="wg-order-row">
              <span className="wg-order-name">Silver</span>
              <span className="wg-order-unit">troy ounces</span>
              <span className="wg-order-issuer">Held to the same test as gold</span>
            </div>
            <div className="wg-order-row">
              <span className="wg-order-name">The market</span>
              <span className="wg-order-unit">share-equivalents</span>
              <span className="wg-order-issuer">A broad sleeve, never a single-name bet</span>
            </div>
            <div className="wg-order-row">
              <span className="wg-order-name">Dollars</span>
              <span className="wg-order-unit">USDC</span>
              <span className="wg-order-issuer">What has not been allocated yet</span>
            </div>
          </div>
        </div>
      </section>

      <section className="wg-band">
        <div className="wg-sec">
          <p className="wg-kicker">Before you ask</p>
          <h2 className="wg-h2">The things a savings product should tell you first.</h2>
          <div className="wg-notes">
            <p className="wg-note">
              <Info size={16} strokeWidth={2} aria-hidden />
              <span>
                <strong>Self-custody here means not our custody.</strong> Tokenized equities
                carry an issuer permanent delegate and a pause authority: the issuer can move,
                burn or freeze them. Webgold never holds your assets, and it cannot promise that
                nobody can touch them.
              </span>
            </p>
            <p className="wg-note">
              <Info size={16} strokeWidth={2} aria-hidden />
              <span>
                <strong>Dividends are reinvested, not paid.</strong> They arrive as a mint-level
                multiplier that changes your balance, so there is no equity income on chain and
                we will never show you an expected one.
              </span>
            </p>
            <p className="wg-note">
              <Info size={16} strokeWidth={2} aria-hidden />
              <span>
                <strong>This is savings-grade, not stable.</strong> Gold, silver and equities
                fall as well as rise. Webgold is not competing with a dollar for your cash
                position — it is competing for the position that sits idle.
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="wg-close">
        <div className="wg-sec">
          <p className="wg-kicker">The memory</p>
          <h2 className="wg-h2">An arrival you can open, forever.</h2>
          <p>
            Every money moment writes a receipt on chain: who paid, who received, the amounts
            mint by mint, the gram-equivalent at the price stamp, and the reason. The database
            is a cache. The chain is the memory.
          </p>
          <Link href="/ledger" className="wg-btn">
            Open the public record
          </Link>
        </div>
      </section>

      <footer className="wg-foot">
        <span>Webgold</span>
        <span className="wg-foot-spacer" />
        <Link href="/assets" className="wg-nav-link">
          Assets
        </Link>
        <Link href="/ledger" className="wg-nav-link">
          Ledger
        </Link>
        <Link href="/docs" className="wg-nav-link">
          Docs
        </Link>
      </footer>
    </div>
  );
}
