import type { Metadata } from "next";
import Link from "next/link";
import { DocFrame } from "@/components/docs/doc-frame";
import { DEPLOYED, configsOf } from "@/lib/curve/deployed";
import { CURVE_STOCKS, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, PRESET, THRESHOLD } from "@/lib/curve/preset";
import { nameOf } from "@/lib/save/names";
import { explorerUrl } from "@/lib/solana/cluster";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const metadata: Metadata = {
  title: "How a launch pays savers",
  description:
    "Scrip Curve, step by step: a token launched on Meteora's Dynamic Bonding Curve, priced in a stock; every trading fee in that stock; the savers' share claimed straight into a Scrip Plan, which adds it to people's automatic saves.",
};

/** The first launch fee that reached a Plan on mainnet: DEMO1's curve into the Nasdaq 100 Plan, 10 Oct 2026. */
const FIRST_FEE = "65kYsghNWSXvyepvQyMV7tBiGgiFb4hXfGyqrdxfyaEKcTurBFhZHH2VAjcczoqYzvGe9HuYS9Ro1sVkgdwWJqVr";

const ROUTE = [
  ["A trade on the curve", "The buyer pays in the stock the launch is priced in, and the fee is charged in that stock: 25% at launch, falling to 1% over the first hour.", "Meteora DBC", "swap"],
  ["Into the Plan", "The config's fee claimer claims the partner fee with the Plan as the receiver, so it moves from the curve's vault to the Plan's escrow in one instruction, through no wallet.", "Meteora DBC", "claim_trading_fee"],
  ["To a saver", "After each member's automatic save, the Plan adds its share of that save from the escrow, in its own transaction, capped each month.", "Scrip", "match_receipt"],
  ["Graduation", "At the threshold the pool moves to DAMM v2 as launch token / stock, every position locked for good. The partner's share of the 2% graduation fee is withdrawn and passed to the Plan.", "Meteora DBC", "migration_damm_v2, withdraw_migration_fee"],
  ["After graduation", "The locked partner position keeps earning fees in the stock, claimed to the same Plan.", "Meteora DAMM v2", "claim_position_fee"],
] as const;

const addr = (a: string) => (
  <a href={explorerUrl("address", a)} className="mono">
    {a.slice(0, 6)}…{a.slice(-4)}
  </a>
);

export default function Page() {
  const configs = configsOf();
  return (
    <DocFrame
      here="/docs/scrip-curve"
      eyebrow="Docs"
      title="How a launch pays savers."
      lede={
        <>
          Scrip Curve is a launch preset on Meteora&rsquo;s Dynamic Bonding Curve, priced in a stock. Every trading fee is that stock, and the
          savers&rsquo; share moves from the curve into a Scrip Plan in the same stock, which adds it to people&rsquo;s automatic saves. Anyone can
          launch, from <Link href="/curve/launch">scrip.work/curve/launch</Link>.
        </>
      }
    >
      <h2>The route, step by step</h2>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>What happens</th>
            <th>Instruction</th>
          </tr>
        </thead>
        <tbody>
          {ROUTE.map(([step, what, program, ix]) => (
            <tr key={step}>
              <td>{step}</td>
              <td>{what}</td>
              <td>
                {program}
                <br />
                <span className="mono">{ix}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        One Plan per stock, because a fee arrives in the stock its curve is priced in, and a Plan&rsquo;s escrow is that stock: a fee never needs a
        swap to reach a saver. The first launch fee to reach a Plan on mainnet:{" "}
        <a href={explorerUrl("tx", FIRST_FEE)} className="mono">
          {FIRST_FEE.slice(0, 8)}…
        </a>
        , from DEMO1&rsquo;s curve into the Nasdaq 100 Plan.
      </p>

      <h2>Why a stock is the quote</h2>
      <ul>
        <li>
          <strong>A fee that is already savings.</strong> Priced in a stock, every buy pays in it and every fee is it, so the savers&rsquo; share
          is stock the moment it is charged.
        </li>
        <li>
          <strong>Open to anyone today.</strong> These xStocks carry a permanent delegate and a pause authority, which Meteora allows only with a
          token badge. Meteora has badged all four for DBC and for DAMM v2 on mainnet, and the badge is checked when the config is made and again
          when each pool is.
        </li>
        <li>
          <strong>An early bot pays savers.</strong> The fee falls from 25% to 1% over the first hour, in sixty steps. A launcher&rsquo;s own first
          buy, in the same transaction as the launch, pays the 1%.
        </li>
      </ul>

      <h2>What Scrip&rsquo;s servers do, and what they cannot</h2>
      <p>
        The fee claimer is a key Scrip&rsquo;s servers hold. Every 30 minutes they find every launch on every Scrip Curve config, read from the
        chain, and claim what is waiting. Meteora lets a claimer choose where a claim goes; Scrip&rsquo;s only ever names the Plan in the
        curve&rsquo;s own stock, and every claim is a public transaction into that Plan&rsquo;s escrow, listed on <Link href="/curve">/curve</Link>.
        Once a fee is in the escrow, only the Scrip program can move it: as a match on a member&rsquo;s save, or back to the Plan&rsquo;s sponsor
        if the Plan is closed once nobody is left in it. A program instruction that claims into the Plan with no key to trust is the next step.
      </p>

      <h2>The presets</h2>
      <table>
        <tbody>
          <tr>
            <td>Priced in</td>
            <td>{CURVE_STOCKS.map((s) => `${nameOf(s)} (${s})`).join(", ")}: xStocks by Backed, Token-2022</td>
          </tr>
          <tr>
            <td>Trading fee</td>
            <td>
              {PRESET.startingFeeBps / 100}% falling to {PRESET.endingFeeBps / 100}% over {PRESET.feeDecaySeconds / 60} minutes, charged in the stock
            </td>
          </tr>
          <tr>
            <td>Who keeps it</td>
            <td>
              Meteora keeps a fifth. Of the rest: public launches, half to the launcher and half to the Plan; demonstrations, all of it to the Plan
            </td>
          </tr>
          <tr>
            <td>Graduation</td>
            <td>
              Public: about $850 of the stock ({CURVE_STOCKS.map((s) => `${THRESHOLD.public[s]} ${s}`).join(", ")}), which Meteora graduates by
              itself. Demonstration: about $15. A {PRESET.migrationFeePercentage}% graduation fee
            </td>
          </tr>
          <tr>
            <td>Liquidity</td>
            <td>Every position permanently locked at graduation</td>
          </tr>
          <tr>
            <td>The token</td>
            <td>SPL, 6 decimals, {PRESET.totalSupply.toLocaleString("en-US")} supply, immutable: no one can mint more or change its name</td>
          </tr>
        </tbody>
      </table>

      <h2>On mainnet</h2>
      <table>
        <tbody>
          <tr>
            <td>Meteora DBC</td>
            <td>{addr(DBC_PROGRAM_ID.toBase58())}</td>
          </tr>
          <tr>
            <td>Meteora DAMM v2</td>
            <td>{addr(DAMM_V2_PROGRAM_ID.toBase58())}</td>
          </tr>
          <tr>
            <td>Scrip</td>
            <td>{addr(SCRIP_PROGRAM_ID.toBase58())}</td>
          </tr>
          {CURVE_STOCKS.map((s) => {
            const plan = DEPLOYED.plans[s];
            return plan ? (
              <tr key={`plan-${s}`}>
                <td>The {nameOf(s)} Plan</td>
                <td>{addr(plan.address)}</td>
              </tr>
            ) : null;
          })}
          {configs.map((c) => (
            <tr key={c.address}>
              <td>
                Config, {nameOf(c.stock)}, {c.kind}
              </td>
              <td>{addr(c.address)}</td>
            </tr>
          ))}
          {DEPLOYED.feeClaimer ? (
            <tr>
              <td>Fee claimer, Scrip&rsquo;s servers</td>
              <td>{addr(DEPLOYED.feeClaimer)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p>
        The code: <span className="mono">src/lib/curve/</span> (the presets, the builders, the claims) and{" "}
        <span className="mono">anchor/programs/scrip/src/plan.rs</span> (the Plan).
      </p>

      <h2>Before you launch or buy</h2>
      <p>
        A launch is a speculative token, not a stock and not a share of one, and it belongs to whoever launched it. Scrip makes no claim about any
        launch&rsquo;s price, only about where its fees go. Names that read like a stock or like Scrip are refused. Not offered to US persons.
      </p>
    </DocFrame>
  );
}
