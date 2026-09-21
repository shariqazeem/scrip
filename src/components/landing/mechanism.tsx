"use client";

import { useEffect, useRef, useState } from "react";
import { useEntered } from "@/components/motion/reveal";
import { bps, usdc } from "@/lib/format";

/**
 * WHAT HAPPENS WHEN MONEY LANDS — the last real sweep, replayed as a scene.
 *
 * A payer's USDC travels to the owner's normal address. A keeper notices. One transaction
 * runs, instruction by instruction: begin_sweep, the route, finish_sweep. The slice becomes
 * stock; the rest stays; a receipt prints. Every figure is the receipt's own; the timing is
 * the animation's. Where no sweep has settled yet the scene plays the front book's rate on a
 * $100 arrival and says so.
 */
export type SweepScene = {
  readonly basisUsdc: string;
  readonly paidUsdc: string;
  readonly rateBps: number;
  readonly units: string;
  readonly symbol: string;
  readonly handle: string | null;
  readonly sig: string | null;
  readonly real: boolean;
};

const STEPS = [
  { at: 0, label: "A payer sends USDC to a normal address" },
  { at: 1, label: "The balance rises above the watermark; a keeper notices" },
  { at: 2, label: "begin_sweep — the program computes the slice from on-chain state" },
  { at: 3, label: "The route — Jupiter, as a top-level instruction the program watches" },
  { at: 4, label: "finish_sweep — the fill is checked against Pyth, or everything reverts" },
  { at: 5, label: "The receipt is written; the rest of the money never moved" },
] as const;

export function Mechanism({ scene }: { scene: SweepScene }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const entered = useEntered(ref);
  const [step, setStep] = useState(-1);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    if (!entered) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(STEPS.length - 1);
      return;
    }
    setStep(-1);
    const timers = STEPS.map((s, i) => setTimeout(() => setStep(i), 350 + s.at * 900));
    return () => timers.forEach(clearTimeout);
  }, [entered, runs]);

  const stayed = BigInt(scene.basisUsdc) - BigInt(scene.paidUsdc);
  const cls = (i: number) => (step >= i ? " on" : "");

  return (
    <div ref={ref} className={`sp-mech${step >= 0 ? " is-playing" : ""}`} data-step={step}>
      <div className="sp-mech-stage" aria-hidden>
        {/* the payer */}
        <div className={`sp-mech-node is-payer${cls(0)}`}>
          <span className="t">A payer</span>
          <span className="v">{usdc(BigInt(scene.basisUsdc))} USDC</span>
        </div>
        {/* the wire, and the coin that rides it */}
        <div className={`sp-mech-wire${cls(0)}`}>
          <span className="coin">$</span>
        </div>
        {/* the wallet */}
        <div className={`sp-mech-node is-wallet${cls(1)}`}>
          <span className="t">{scene.handle ? `@${scene.handle}’s address` : "Your address"}</span>
          <span className="v">{usdc(BigInt(scene.basisUsdc))} landed</span>
          <span className={`rule${cls(1)}`}>rule: {bps(scene.rateBps)}</span>
        </div>
        {/* the transaction */}
        <div className={`sp-mech-tx${cls(2)}`}>
          <span className="t">one transaction, atomic</span>
          <ol>
            <li className={cls(2)}>begin_sweep</li>
            <li className={cls(3)}>jupiter route</li>
            <li className={cls(4)}>finish_sweep</li>
          </ol>
          <span className={`chk${cls(4)}`}>Pyth min-out ✓</span>
        </div>
        {/* the split */}
        <div className={`sp-mech-split${cls(5)}`}>
          <div className="stock">
            <span className="t">became</span>
            <span className="u">
              {scene.units}
              <span className="s">{scene.symbol}</span>
            </span>
            <span className="v">{usdc(BigInt(scene.paidUsdc))}</span>
          </div>
          <div className="cash">
            <span className="t">stayed USDC</span>
            <span className="v">{usdc(stayed)}</span>
          </div>
        </div>
      </div>
      <ol className="sp-mech-steps">
        {STEPS.map((s, i) => (
          <li key={i} className={cls(i)}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="sp-mech-foot">
        <span>{scene.real ? `The last sweep, replayed from its receipt${scene.sig ? "" : ""}.` : `No sweep has settled here yet: the rule at ${bps(scene.rateBps)} on a $100 arrival, as arithmetic.`}</span>
        <button type="button" className="sp-mech-replay" onClick={() => setRuns((n) => n + 1)}>
          Replay
        </button>
        {scene.real && scene.sig ? (
          <a href={`/receipt/${scene.sig}`} className="sp-mech-open">
            Open the receipt
          </a>
        ) : null}
      </div>
    </div>
  );
}
