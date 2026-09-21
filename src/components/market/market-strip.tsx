"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Market } from "@/lib/market";
import { usd } from "@/lib/format";
import { Roll } from "@/components/motion/roll";
import "./market.css";

/**
 * THE MARKET, LIVE, ON THE FRONT DOOR.
 *
 * "The S&P 500 is open on Solana." Every figure is read from a source anyone can query:
 * Jupiter for the tracker's price, the underlying's price, liquidity, volume and holders;
 * the mint for the dividend multiplier; the clock for the NYSE session. The strip polls every
 * twenty seconds and the clock ticks every second. Nothing here is decoration.
 */
export function MarketStrip({ initial, tone }: { initial: Market; tone?: "dark" }) {
  const [m, setM] = useState<Market>(initial);
  const [now, setNow] = useState<number>(initial.at);

  useEffect(() => {
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        if (res.ok) setM((await res.json()) as Market);
      } catch {
        // The last reading stands until the next poll; its age is on the row.
      }
    }, 20_000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  const spy = m.rows.find((r) => r.symbol === "SPYx") ?? m.rows[0] ?? null;
  const age = spy ? now - spy.readAt : 0;

  return (
    <section className={`sp-market${tone === "dark" ? " is-dark" : ""}`} aria-label="The market on Solana, live">
      <div className="sp-market-head">
        <h2 className="sp-market-h2">{m.session.open ? "The S&P 500 is open. So is Solana." : "The S&P 500 is closed. Solana is open."}</h2>
        <p className="sp-market-clock">
          <span className="sp-market-dot" aria-hidden />
          <span>{utc(now)} UTC</span>
          <span>{m.session.line}</span>
          <span>Solana never closes</span>
        </p>
      </div>
      <div className="sp-market-rows">
        {m.rows.map((r) => (
          <div key={r.mint} className="sp-market-row">
            <div className="sp-market-name">
              <span className="sym">{r.symbol}</span>
              <span className="name">{r.name}</span>
            </div>
            <div className="sp-market-price">
              {r.priceUsd !== null ? <Roll className="big" value={r.priceUsd} kind="usd" /> : <span className="held">no price yet</span>}
              {r.change24hPct !== null ? <span className={`chg${r.change24hPct >= 0 ? " up" : " down"}`}>{r.change24hPct >= 0 ? "+" : ""}{r.change24hPct.toFixed(2)}% today</span> : null}
            </div>
            <dl className="sp-market-facts">
              {r.underlyingUsd !== null && r.priceUsd !== null ? (
                <div>
                  <dt>{r.underlying} on the exchange</dt>
                  <dd>
                    {usd(r.underlyingUsd)} <span className="muted">({drift(r.priceUsd, r.underlyingUsd)})</span>
                  </dd>
                </div>
              ) : null}
              {r.volume24hUsd !== null ? (
                <div>
                  <dt>Traded in 24 hours</dt>
                  <dd>
                    <Roll value={r.volume24hUsd} kind="compact" />
                  </dd>
                </div>
              ) : null}
              {r.liquidityUsd !== null ? (
                <div>
                  <dt>Liquidity on Jupiter</dt>
                  <dd>
                    <Roll value={r.liquidityUsd} kind="compact" />
                  </dd>
                </div>
              ) : null}
              {r.holders !== null ? (
                <div>
                  <dt>Wallets holding it</dt>
                  <dd>
                    <Roll value={r.holders} kind="int" />
                  </dd>
                </div>
              ) : null}
              {r.multiplier ? (
                <div>
                  <dt>Dividends reinvested</dt>
                  <dd>×{trim(r.multiplier)}</dd>
                </div>
              ) : r.multiplierWhy ? (
                <div>
                  <dt>Dividends</dt>
                  <dd className="muted">{r.multiplierWhy}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
      <p className="sp-market-foot">
        Prices from Jupiter, read {age < 5 ? "just now" : `${age}s ago`}, for display; a sweep settles against Pyth on chain. Trackers issued by Backed; the GOLD row is Oro.{" "}
        <Link href="/assets">What each issuer can do.</Link>
      </p>
    </section>
  );
}

function utc(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}
function drift(tracker: number, underlying: number): string {
  const pct = ((tracker - underlying) / underlying) * 100;
  const abs = Math.abs(pct).toFixed(2);
  return pct >= 0 ? `tracker ${abs}% above` : `tracker ${abs}% below`;
}
function trim(m: string): string {
  const n = Number(m);
  return Number.isFinite(n) ? n.toFixed(4) : m;
}
