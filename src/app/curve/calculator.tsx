"use client";

import { useState } from "react";
import { StockLogo } from "@/components/stock/stock-logo";

/**
 * WHAT A LAUNCH PAYS SAVERS — arithmetic on the preset, labelled as such. A launch's volume is the
 * one number Scrip cannot know, so the reader picks it; everything else is the config's own terms
 * (passed in from `PRESET`, so the page and the config cannot disagree) and, for the stock's units,
 * Jupiter's price right now. Not a forecast of any launch.
 */
export type CalcStock = { readonly symbol: string; readonly name: string; readonly mint: string; readonly perUnitUsd: number | null };
export type CalcTerms = {
  /** The fee from the end of the first hour on, in basis points. */
  readonly feeBps: number;
  /** The fee a launch opens at, in basis points. */
  readonly firstHourFeeBps: number;
  /** Meteora's own share of every fee, in percent. */
  readonly meteoraPercent: number;
  /** Of the rest, what a public launch's launcher keeps, in percent. */
  readonly launcherPercent: number;
  /** Of the curve's stock at graduation, in percent. */
  readonly migrationFeePercent: number;
};

const VOLUMES = [10_000, 100_000, 1_000_000] as const;
const short = (v: number) => (v >= 1_000_000 ? `$${v / 1_000_000}M` : `$${v / 1_000}K`);
const usd = (v: number) => (v >= 100 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`);
const units = (v: number) => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(4));

export function FeeCalculator({ stocks, terms }: { stocks: readonly CalcStock[]; terms: CalcTerms }) {
  const [symbol, setSymbol] = useState(stocks[0]?.symbol ?? "");
  const [volume, setVolume] = useState<number>(100_000);
  const stock = stocks.find((s) => s.symbol === symbol) ?? stocks[0];
  const fee = (volume * terms.feeBps) / 10_000;
  const meteora = (fee * terms.meteoraPercent) / 100;
  const launcher = ((fee - meteora) * terms.launcherPercent) / 100;
  const savers = fee - meteora - launcher;
  const inStock = stock?.perUnitUsd ? savers / stock.perUnitUsd : null;

  return (
    <section className="sp-cvh-calc" aria-labelledby="sp-cvh-calc-h">
      <h2 id="sp-cvh-calc-h" className="sp-cvh-h">
        What a launch pays savers
      </h2>
      <div className="sp-cvh-ask">
        <span className="w">Say a launch trades</span>
        <div className="sp-cvh-seg" role="radiogroup" aria-label="How much the launch trades">
          {VOLUMES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={volume === v}
              className={`sp-cvh-segbtn${volume === v ? " is-on" : ""}`}
              onClick={() => setVolume(v)}
            >
              {short(v)}
            </button>
          ))}
        </div>
      </div>
      <div className="sp-cvh-ask">
        <span className="w">priced in</span>
        <div className="sp-cvh-picks" role="radiogroup" aria-label="The stock it is priced in">
          {stocks.map((s) => (
            <button
              key={s.symbol}
              type="button"
              role="radio"
              aria-checked={s.symbol === stock?.symbol}
              className={`sp-cvh-pick${s.symbol === stock?.symbol ? " is-on" : ""}`}
              onClick={() => setSymbol(s.symbol)}
            >
              <StockLogo mint={s.mint} size={22} eager />
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <div className="sp-cvh-out" aria-live="polite">
        <p className="big">
          <span className="v">{usd(savers)}</span> of {stock?.name} to savers
        </p>
        <p className="sub">
          {inStock !== null ? `About ${units(inStock)} ${stock?.name} at Jupiter's price now, ` : ""}
          straight into a Scrip Plan that adds it to people&rsquo;s automatic saves.
        </p>
        <dl className="sp-cvh-split">
          <div>
            <dt>The fee, {terms.feeBps / 100}% of every trade</dt>
            <dd>{usd(fee)}</dd>
          </div>
          <div>
            <dt>Meteora&rsquo;s share, {terms.meteoraPercent}%</dt>
            <dd>{usd(meteora)}</dd>
          </div>
          <div>
            <dt>The launcher&rsquo;s half of the rest</dt>
            <dd>{usd(launcher)}</dd>
          </div>
          <div className="is-savers">
            <dt>The savers&rsquo; half</dt>
            <dd>{usd(savers)}</dd>
          </div>
        </dl>
      </div>
      <p className="sp-cvh-fine">
        Arithmetic on the preset, not a forecast of any launch. After its first hour a launch charges {terms.feeBps / 100}% of every trade; in the
        first hour it charges up to {terms.firstHourFeeBps / 100}%, which pays savers more. At graduation a further {terms.migrationFeePercent}% of
        the curve&rsquo;s stock goes half to the launcher and half to savers.
      </p>
    </section>
  );
}
