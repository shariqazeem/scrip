import Link from "next/link";
import { MarketStrip } from "@/components/market/market-strip";
import { Reveal } from "@/components/motion/reveal";
import { Roll } from "@/components/motion/roll";
import type { FloorView } from "@/lib/floor";
import { bps, dateUTC, since, usdc } from "@/lib/format";
import { Tape } from "./tape";
import "./floor.css";

/**
 * THE FLOOR — the tape; the clock and the share of arrivals that happened while Wall Street
 * slept; keep-rate; the keepers; corporate actions on stage; the market. The same view on
 * the front door and at /floor inside the app. Ink-dark: where the crowd is.
 */
export function Floor({ view, dark = true }: { view: FloorView; dark?: boolean }) {
  const now = view.at;
  const hoursUntil = Math.round(view.session.until / 3600);
  return (
    <div className={`sp-floor${dark ? " is-dark" : ""}`}>
      <section className="sp-floor-clock">
        <div className="sp-floor-clockline">
          <span className="k">NYSE</span>
          <span className="v">{view.session.open ? `open, closes in ${hoursUntil} h` : `closed, opens in ${hoursUntil} h`}</span>
          <span className="k">Scrip</span>
          <span className="v is-open">open</span>
        </div>
        <Reveal className="sp-floor-facts">
          <div className="sp-floor-fact">
            <p className="k">Arrivals while Wall Street slept</p>
            <p className="v">
              {view.slept.total > 0 ? <Roll value={view.slept.bps / 100} kind="pct" /> : "—"}
            </p>
            <p className="n">{view.slept.total > 0 ? `${view.slept.count} of ${view.slept.total} settled outside the NYSE session` : "the first arrival tells"}</p>
          </div>
          <div className="sp-floor-fact">
            <p className="k">Keep-rate at 7 days</p>
            <p className="v">{view.keepRate7 ? <Roll value={view.keepRate7.bps / 100} kind="pct2" /> : "—"}</p>
            <p className="n">
              {view.keepRate7
                ? `over ${view.keepRate7.receipts} receipts`
                : view.firstMaturesAt
                  ? `the first receipt is measured ${new Date(view.firstMaturesAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`
                  : "measured seven days after the first receipt"}{" "}
              · <Link href="/docs/keep-rate">method</Link>
            </p>
          </div>
          <div className="sp-floor-fact">
            <p className="k">Keep-rate at 30 days</p>
            <p className="v">{view.keepRate30 ? <Roll value={view.keepRate30.bps / 100} kind="pct2" /> : "—"}</p>
            <p className="n">{view.keepRate30 ? `over ${view.keepRate30.receipts} receipts` : "measured on chain, by anyone"}</p>
          </div>
          <div className="sp-floor-fact">
            <p className="k">Keepers racing</p>
            <p className="v">
              <Roll value={view.keepers.running} kind="int" />
            </p>
            <p className="n">
              {view.keepers.roster} {view.keepers.roster === 1 ? "has" : "have"} won a sweep · {view.keepers.sweeps} sweeps, {view.keepers.vests} vests
              {view.keepers.lastAt ? `, last ${since(view.keepers.lastAt, now * 1000)}` : ""}
              {view.keepers.alive ? `, ${view.keepers.watched} registers watched now` : ", none reporting now"} · <Link href="/keepers">run one</Link>
            </p>
          </div>
          <div className="sp-floor-fact">
            <p className="k">Receipts</p>
            <p className="v">
              <Roll value={view.totals.receipts} kind="int" />
            </p>
            <p className="n">
              {usdc(BigInt(view.totals.paidUsdc))} became stock · {view.totals.outsideTeam} to wallets outside the team · {view.totals.rulesOn} rules on · {view.totals.orgs} organisation{view.totals.orgs === 1 ? "" : "s"}
              {view.mainnetDay ? ` · day ${view.mainnetDay} on mainnet` : ""} · <Link href="/ledger">the ledger</Link>
            </p>
          </div>
        </Reveal>
      </section>

      <section className="sp-floor-tape">
        <Tape initial={view.tape} dark={dark} />
      </section>

      {view.actions.length > 0 ? (
        <section className="sp-floor-actions">
          <p className="sp-floor-label">
            <span>Corporate actions, on stage</span>
            <Link href="/actions">how the register handles them</Link>
          </p>
          <div className="sp-floor-actionrows">
            {view.actions.map((a) => (
              <p key={a.mint} className="sp-floor-actionrow">
                <span className="sym">{a.symbol}</span>
                <span className="mult">{a.multiplier ? `×${Number(a.multiplier).toFixed(6)}` : "multiplier unread"}</span>
                <span className="note">
                  {a.multiplier ? "dividends reinvested through the multiplier; every register is already right" : "the mint could not be read from here"}
                  {a.lastEffectiveAt ? ` · last change ${dateUTC(a.lastEffectiveAt)}` : ""}
                </span>
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sp-floor-market">
        <Reveal className="sp-reveal">
          <MarketStrip initial={view.market} tone={dark ? "dark" : undefined} />
        </Reveal>
      </section>
      <p className="sp-floor-foot">
        Every line is a receipt account anyone can open. Rates, keep-rate and the multiplier are read from the chain; prices from Jupiter, for display. {view.slept.total > 0 ? `${bps(view.slept.bps)} of arrivals settled while the exchange was shut.` : ""}
      </p>
    </div>
  );
}
