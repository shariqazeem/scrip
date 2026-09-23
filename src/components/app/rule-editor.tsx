"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { ConnectWallet } from "@/components/auth/connect";
import { bps as fmtBps, sol, usd, usdc } from "@/lib/format";
import { normalizeSlug, validateSlug } from "@/lib/handle";
import {
  DEFAULT_ALLOWANCE_USDC,
  DEFAULT_CAP_USDC,
  DEFAULT_ESCALATION_BPS,
  DEFAULT_RATE_BPS,
  DEFAULT_TOLERANCE_BPS,
  MAX_RATE_BPS,
  RATE_PRESETS_BPS,
  SUGGESTED_FLOAT_LAMPORTS,
  SWEEP_COST_LAMPORTS,
  preview,
  sweepsCovered,
  validateRule,
} from "@/lib/rule/slice";
import { signRuleAction } from "./sign-rule";
import { ExampleStub } from "@/components/stub/stub";
import "./rule.css";
import { useTxToast } from "@/components/toast/use-tx-toast";

type AssetOpt = { mint: string; symbol: string; name: string; singleName: boolean; xstocks: boolean; issuer: string; kind: string };
type View = {
  hasBook: boolean;
  slug: string | null;
  assetMint: string | null;
  state: string;
  rule: { enabled: boolean; rateBps: number; escalateBps: number; floorUsdc: string; capUsdc: string; toleranceBps: number } | null;
  usdcBalance: string;
  usdcExists: boolean;
  delegatedAmount: string;
  floatLamports: string;
  sweepsCovered: number;
  /** The owner's own SOL, and what a Book plus a Handle costs on this cluster. */
  ownerLamports: string;
  openCostLamports: string;
};

/**
 * ONE QUESTION. "How much of every payment should become stock?" Three large numbers, one
 * signature. Everything else has a default and lives under "what the rule may do".
 *
 * Validated continuously against the ranges the program enforces, so nobody pays a fee to
 * be told their rate is out of range.
 */
/** What the page shows before a wallet is connected: the question, answerable, with nothing to sign yet. */
const SIGNED_OUT: View = { hasBook: false, slug: null, assetMint: null, state: "off", rule: null, usdcBalance: "0", usdcExists: true, delegatedAmount: "0", floatLamports: "0", sweepsCovered: 0, ownerLamports: "0", openCostLamports: "0" };

export function RuleEditor({
  owner,
  view: viewIn,
  assets,
  prices = {},
  solPrice = null,
}: {
  owner: string | null;
  view: View | null;
  assets: AssetOpt[];
  prices?: Record<string, number>;
  /** SOL in dollars on Jupiter, for DISPLAY: what a receipt costs in money a person reads. */
  solPrice?: number | null;
}) {
  const router = useRouter();
  const view: View = viewIn ?? SIGNED_OUT;
  const r = view.rule;
  const enabled = !!r?.enabled;
  const [slug, setSlug] = useState(view.slug ?? "");
  const [assetMint, setAssetMint] = useState(view.assetMint ?? assets[0]?.mint ?? "");
  const [rateBps, setRateBps] = useState(r?.rateBps ?? DEFAULT_RATE_BPS);
  const [custom, setCustom] = useState(r ? !RATE_PRESETS_BPS.includes(r.rateBps as (typeof RATE_PRESETS_BPS)[number]) : false);
  const [escalate, setEscalate] = useState((r?.escalateBps ?? 0) > 0);
  const [floor, setFloor] = useState(r && Number(r.floorUsdc) > 0 ? String(Number(r.floorUsdc) / 1e6) : "");
  const [cap, setCap] = useState(r ? (Number(r.capUsdc) > 0 ? String(Number(r.capUsdc) / 1e6) : "") : String(Number(DEFAULT_CAP_USDC) / 1e6));
  const [toleranceBps, setToleranceBps] = useState(r?.toleranceBps ?? DEFAULT_TOLERANCE_BPS);
  const [allowance, setAllowance] = useState(String(Number(DEFAULT_ALLOWANCE_USDC) / 1e6));
  const [floatSol, setFloatSol] = useState(String(Number(SUGGESTED_FLOAT_LAMPORTS) / 1e9));
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // The same words as the button, where a person can still see them after scrolling away.
  useTxToast(why ? "failed" : done ? "done" : busy ? "signing" : "idle", busy === "start" ? "Turn on the rule" : busy ? "Change the rule" : "The rule", { href: done ? `/receipt/${done}` : undefined, detail: why ?? undefined });

  // The answer survives the wallet popup: chosen signed out, kept through sign-in.
  useEffect(() => {
    if (viewIn?.hasBook) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem("scrip.rule") ?? "null") as { rateBps?: number; slug?: string; assetMint?: string; custom?: boolean } | null;
      if (saved?.rateBps) setRateBps(saved.rateBps);
      if (saved?.custom) setCustom(true);
      if (saved?.slug) setSlug(saved.slug);
      if (saved?.assetMint && assets.some((a) => a.mint === saved.assetMint)) setAssetMint(saved.assetMint);
    } catch {
      // nothing saved, or storage unavailable: the defaults stand
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (view.hasBook) return;
    try {
      sessionStorage.setItem("scrip.rule", JSON.stringify({ rateBps, slug, assetMint, custom }));
    } catch {
      // storage unavailable: the choice lives in this render only
    }
  }, [rateBps, slug, assetMint, custom, view.hasBook]);

  const asset = assets.find((a) => a.mint === assetMint) ?? assets[0]!;
  const terms = useMemo(
    () => ({
      rateBps,
      escalateBps: escalate ? DEFAULT_ESCALATION_BPS : 0,
      floorUsdc: BigInt(Math.round(Number(floor || 0) * 1e6)),
      capUsdc: BigInt(Math.round(Number(cap || 0) * 1e6)),
      toleranceBps,
    }),
    [rateBps, escalate, floor, cap, toleranceBps],
  );
  const validity = validateRule(terms);
  const example = preview(500_000_000n, terms);
  const slugCheck = view.hasBook ? null : validateSlug(slug);
  const needsAttest = asset.xstocks && (!view.hasBook || view.assetMint !== asset.mint);
  const allowanceUsdc = BigInt(Math.round(Number(allowance || 0) * 1e6));
  const floatLamports = BigInt(Math.round(Number(floatSol || 0) * 1e9));
  const termsBody = { rateBps: terms.rateBps, escalateBps: terms.escalateBps, floorUsdc: terms.floorUsdc.toString(), capUsdc: terms.capUsdc.toString(), toleranceBps: terms.toleranceBps };

  // CAN THIS WALLET AFFORD IT? The program moves the float with a system transfer, so a
  // wallet short by a lamport fails at simulation — and a wallet shows that as "Failed to
  // simulate the results of this request", which tells the owner nothing at all. Anyone who
  // meets that message once does not come back. Answer it here, before the wallet opens,
  // with the real numbers: rent read off this cluster, plus the float they chose, plus a
  // little for the signature.
  // Units for the preview stub, from the display price. Never rendered when absent.
  const assetPrice = prices[assetMint] ?? null;
  const previewUnits =
    example.ok && assetPrice !== null && assetPrice > 0
      ? (Number(example.value.slice) / 1e6 / assetPrice).toFixed(4)
      : null;

  const FEE_HEADROOM = 100_000n;
  const ownerLamports = BigInt(view.ownerLamports || "0");
  const needed = (view.hasBook ? 0n : BigInt(view.openCostLamports || "0")) + floatLamports + FEE_HEADROOM;
  const short = owner !== null && ownerLamports < needed ? needed - ownerLamports : 0n;

  async function run(label: string, body: Record<string, unknown>, message: string, then?: () => void) {
    if (!owner) return;
    setBusy(label);
    setWhy(null);
    setDone(null);
    const out = await signRuleAction(owner, body);
    setBusy(null);
    if (!out.ok) {
      if (out.why) setWhy(out.why);
      return;
    }
    setDone(message);
    router.refresh();
    then?.();
  }

  const goHome = () => setTimeout(() => router.push("/app"), 900);
  const canStart = validity.ok && (view.hasBook || (slugCheck?.ok ?? false)) && (!needsAttest || attest) && allowanceUsdc > 0n && view.usdcExists;

  return (
    <div className="sp-rulepage">
      {/* ── the one question ─────────────────────────────────────────────── */}
      <section className="sp-q">
        <p className="sp-q-label">{enabled ? "Your rate" : "How much of every payment should become stock?"}</p>
        <div className="sp-q-presets">
          {RATE_PRESETS_BPS.map((p) => (
            <button
              key={p}
              type="button"
              className={`sp-q-preset${!custom && rateBps === p ? " on" : ""}`}
              onClick={() => {
                setCustom(false);
                setRateBps(p);
              }}
            >
              <span className="rate">{fmtBps(p)}</span>
              <span className="note">{p === 500 ? "a start" : p === 1_000 ? "the default" : "pay yourself first"}</span>
            </button>
          ))}
          <button type="button" className={`sp-q-preset is-other${custom ? " on" : ""}`} onClick={() => setCustom(true)}>
            <span className="rate">{custom ? fmtBps(rateBps) : "…"}</span>
            <span className="note">another rate</span>
          </button>
        </div>
        {custom ? (
          <label className="sp-q-slider">
            <input type="range" min={100} max={MAX_RATE_BPS} step={50} value={rateBps} className="sp-range" onChange={(e) => setRateBps(Number(e.target.value))} aria-label="Rate" />
            <span className="mono">{fmtBps(rateBps)}</span>
          </label>
        ) : null}
        <p className="sp-q-example">
          {example.ok ? (
            <>
              A <span className="mono">$500</span> payment becomes <span className="mono">{usdc(example.value.slice)}</span> of {asset.symbol}. <span className="mono">{usdc(500_000_000n - example.value.slice)}</span> stays USDC, untouched.
            </>
          ) : (
            example.why
          )}
        </p>
        {/*
          THE OBJECT, BEFORE THE SIGNATURE. The stub is the thing this product makes, and
          until now a person only met it after committing. Here it reacts to the rate as
          they move it, so the choice has a picture instead of a sentence. Labelled
          arithmetic throughout: the units come from Jupiter's display price, and when that
          cannot be read the stub says so rather than inventing a number.
        */}
        {example.ok ? (
          <div className="sp-q-preview">
            <ExampleStub
              landedUsd={500}
              rateBps={terms.rateBps}
              units={previewUnits ?? "—"}
              symbol={asset.symbol}
              when={slug ? `in @${slug}’s wallet, seconds later` : "in your own wallet, seconds later"}
              foot={
                previewUnits
                  ? `Arithmetic at ${asset.symbol} $${assetPrice!.toLocaleString("en-US", { maximumFractionDigits: 2 })} on Jupiter, for display. Your first real receipt replaces this.`
                  : "Arithmetic. The price could not be read just now, so the units are left out rather than guessed."
              }
            />
            {/*
              WHAT EACH RECEIPT COSTS, beside the receipt. Every sweep pays the keeper 0.0005 SOL
              and the rent of the receipt it writes, which stays on chain with it: 0.00302 SOL. In
              dollars and as a share of the slice, because "0.003 SOL" is a number nobody can weigh
              — and on a small payment it is most of the slice. Said before the signature.
            */}
            <p className="sp-q-preview-cost">
              Each receipt costs your register {sol(SWEEP_COST_LAMPORTS)}
              {solPrice ? ` — about ${usd((Number(SWEEP_COST_LAMPORTS) / 1e9) * solPrice)} at today’s SOL price` : ""}: 0.0005 SOL to the keeper who
              settles it, the rest the receipt&rsquo;s rent, kept on chain with it.
              {solPrice && terms.rateBps > 0
                ? ` On this $500 example that is ${(((Number(SWEEP_COST_LAMPORTS) / 1e9) * solPrice) / ((500 * terms.rateBps) / 10_000) * 100).toFixed(1)}% of the ${usd((500 * terms.rateBps) / 10_000)} slice; on a $50 payment, ${(((Number(SWEEP_COST_LAMPORTS) / 1e9) * solPrice) / ((50 * terms.rateBps) / 10_000) * 100).toFixed(0)}%.`
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      {/* ── the two details that are not defaults ───────────────────────── */}
      <section className="sp-q-details">
        {!view.hasBook ? (
          <label className="sp-q-row">
            <span className="k">Your handle</span>
            <span className="v">
              <span className="sp-q-at">@</span>
              <input className="sp-input is-mono" placeholder="yourname" value={slug} onChange={(e) => setSlug(normalizeSlug(e.target.value))} />
            </span>
            <span className="note">{slugCheck && !slugCheck.ok && slug ? slugCheck.why : `Your pay link: /pay/${slug || "yourname"}. One per wallet, cannot be changed.`}</span>
          </label>
        ) : null}
        <div className="sp-q-row">
          <span className="k">Becomes</span>
          <span className="v">
            <span className="sp-choices">
              {assets
                .filter((a) => !a.singleName || a.mint === assetMint)
                .map((a) => (
                  <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={a.name}>
                    {a.symbol}
                  </button>
                ))}
              <details className="sp-q-more">
                <summary className="sp-choice">a single name…</summary>
                <span className="sp-choices" style={{ marginTop: 8 }}>
                  {assets
                    .filter((a) => a.singleName)
                    .map((a) => (
                      <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={a.name}>
                        {a.symbol}
                      </button>
                    ))}
                </span>
              </details>
            </span>
          </span>
          <span className="note">
            {asset.name}, issued by {asset.issuer}.{asset.singleName ? " A single name is your choice, never a default; after-hours liquidity can be thin." : ""}
            {asset.kind === "metal" ? " Priced in market hours, so sweeps wait outside them." : ""}
            {view.hasBook && view.assetMint !== asset.mint ? " Switching resets the watermark to today’s balance." : ""}
          </span>
        </div>
        {needsAttest ? (
          <label className="sp-check">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
            <span>
              I am not a US person, and I understand {asset.symbol} is a tracker certificate issued by Backed whose issuer can freeze and move it,
              and that dividends are reinvested, not paid.
            </span>
          </label>
        ) : null}
      </section>

      {/* ── what the rule may do: defaults, folded ──────────────────────── */}
      <details className="sp-q-advanced">
        <summary>
          What the rule may do <span className="mono">· allowance {usd(Number(allowance || 0))} · cap {cap ? usd(Number(cap)) : "none"} · floor {floor ? usd(Number(floor)) : "none"} · tolerance {fmtBps(toleranceBps)}</span>
        </summary>
        <div className="sp-q-advanced-body">
          {!enabled ? (
            <>
              <label className="sp-q-row">
                <span className="k">Allowance</span>
                <span className="v">
                  <span className="sp-input-wrap">
                    <span className="sp-input-prefix">$</span>
                    <input className="sp-input is-mono" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9.]/g, ""))} />
                  </span>
                </span>
                <span className="note">
                  The most the delegate may move in total before you approve again. The delegate is your own register&rsquo;s address: it can move USDC only
                  through a sweep the program verifies, only into {asset.symbol}, only into your own account, never to a third party. Revoking it is one
                  instruction on the token program; Scrip cannot stop you.
                </span>
              </label>
            </>
          ) : null}
          <label className="sp-q-row">
            <span className="k">Cap per inflow</span>
            <span className="v">
              <span className="sp-input-wrap">
                <span className="sp-input-prefix">$</span>
                <input className="sp-input is-mono" inputMode="decimal" placeholder="none" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ""))} />
              </span>
            </span>
            <span className="note">The most of one arrival that counts. Keeps a treasury move from being taxed in full.</span>
          </label>
          <label className="sp-q-row">
            <span className="k">Floor</span>
            <span className="v">
              <span className="sp-input-wrap">
                <span className="sp-input-prefix">$</span>
                <input className="sp-input is-mono" inputMode="decimal" placeholder="none" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ""))} />
              </span>
            </span>
            <span className="note">A sweep never takes your USDC below it.</span>
          </label>
          <label className="sp-q-row">
            <span className="k">Tolerance</span>
            <span className="v">
              <input type="range" min={50} max={300} step={10} value={toleranceBps} className="sp-range" onChange={(e) => setToleranceBps(Number(e.target.value))} aria-label="Tolerance" />
              <span className="mono">{fmtBps(toleranceBps)}</span>
            </span>
            <span className="note">How far below the Pyth price a fill may land. Worse than this reverts the whole sweep; the keeper cannot loosen it.</span>
          </label>
          <label className="sp-check">
            <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
            <span>Add 1% every three months, up to half. A raise is easiest to save when it arrives.</span>
          </label>
        </div>
      </details>

      {/* ── the signature ───────────────────────────────────────────────── */}
      <section className="sp-q-sign">
        {!validity.ok ? (
          <p className="sp-why">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {validity.why}
          </p>
        ) : null}
        {owner && !view.usdcExists && !enabled ? <p className="sp-why">This wallet has no USDC account yet. The rule watches it; receive any USDC first and come back.</p> : null}
        {!owner ? (
          <div className="sp-q-connect">
            <p className="sp-q-connect-h">Connect the wallet you get paid to.</p>
            <ConnectWallet />
          </div>
        ) : !view.hasBook ? (
          <button
            type="button"
            className="sp-action is-primary is-big"
            disabled={busy !== null || !canStart || short > 0n}
            onClick={() => void run("start", { action: "start", slug, assetMint: asset.mint, termsVersion: asset.xstocks ? 1 : 0, terms: termsBody, allowanceUsdc: allowanceUsdc.toString(), floatLamports: floatLamports.toString() }, "The rule is on. Watching your wallet.", goHome)}
          >
            {busy === "start" ? "Waiting for your wallet…" : "Turn on the rule"}
          </button>
        ) : !enabled ? (
          <button
            type="button"
            className="sp-action is-primary is-big"
            disabled={busy !== null || !canStart || short > 0n}
            onClick={() => void run("enable", { action: "enable", terms: termsBody, allowanceUsdc: allowanceUsdc.toString(), floatLamports: floatLamports.toString() }, "The rule is on. Watching your wallet.", goHome)}
          >
            {busy === "enable" ? "Waiting for your wallet…" : "Turn on the rule"}
          </button>
        ) : (
          <div className="sp-actions">
            <button type="button" className="sp-action is-primary is-big" disabled={busy !== null || !validity.ok} onClick={() => void run("change", { action: "change", terms: termsBody }, "Changed.", goHome)}>
              {busy === "change" ? "Waiting for your wallet…" : "Sign the new rate"}
            </button>
            {view.assetMint !== asset.mint ? (
              <button type="button" className="sp-action" disabled={busy !== null || (needsAttest && !attest)} onClick={() => void run("asset", { action: "asset", assetMint: asset.mint, termsVersion: asset.xstocks ? 1 : 0 }, `Now becomes ${asset.symbol}.`)}>
                {busy === "asset" ? "Waiting…" : `Switch to ${asset.symbol}`}
              </button>
            ) : null}
            <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("allowance", { action: "allowance", allowanceUsdc: allowanceUsdc.toString() }, "Allowance re-approved.")}>
              {busy === "allowance" ? "Waiting…" : `Re-approve ${usd(Number(allowance || 0))}`}
            </button>
            <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("float", { action: "float", lamports: floatLamports.toString() }, "Float topped up.")}>
              {busy === "float" ? "Waiting…" : `Add ${sol(floatLamports)} float`}
            </button>
            <button type="button" className="sp-action is-quiet" disabled={busy !== null} onClick={() => void run("disable", { action: "disable" }, "The rule is off, and the delegate is revoked.", goHome)}>
              {busy === "disable" ? "Waiting…" : "Turn off"}
            </button>
          </div>
        )}
        {/*
          WHAT THIS COSTS — one block, always visible, never a setting buried in a panel.
          Float used to sit under "what the rule may do" beside cap, floor and tolerance,
          which are genuine policy choices a person makes about their own money. Float is
          not a policy: it is prepayment for receipts this register will write. Asking for
          it as a decision invented a question nobody can answer, and it is the single thing
          that stops a new wallet from starting. It is still adjustable, because someone
          short of SOL needs the lever — but it reads as a price, not a choice.
        */}
        {!view.hasBook && owner !== null ? (
          <div className="sp-q-cost">
            <p className="sp-q-cost-head">
              What this costs <span className="mono">{sol(needed)}</span>
            </p>
            <p className="sp-q-cost-row">
              <span className="mono">{sol(BigInt(view.openCostLamports))}</span> rent for your register and its handle —{" "}
              <strong>it comes back</strong> if you ever close the register.
            </p>
            <p className="sp-q-cost-row">
              <span className="sp-input-wrap is-inline">
                <span className="sp-input-prefix">◎</span>
                <input
                  className="sp-input is-mono"
                  inputMode="decimal"
                  aria-label="Prepaid for receipts, in SOL"
                  value={floatSol}
                  onChange={(e) => setFloatSol(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </span>{" "}
              prepaid for your first <span className="mono">{sweepsCovered(floatLamports)}</span> receipts. Every arrival
              writes one that lives on chain forever, and whoever submits it is paid a tip.
            </p>
            <p className="sp-q-cost-foot">
              Nothing here is invested and none of it is ours: it sits on your own register, and you can withdraw what is
              unspent at any time.
            </p>
          </div>
        ) : null}
        {short > 0n ? (
          <p className="sp-why is-err">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> Not enough SOL. This needs{" "}
            <span className="mono">{sol(needed)}</span> — {view.hasBook ? "" : `${sol(BigInt(view.openCostLamports))} of rent for your register and handle, `}
            {sol(floatLamports)} of float, and a little for the signature. This wallet has{" "}
            <span className="mono">{sol(ownerLamports)}</span>, so it is short{" "}
            <span className="mono">{sol(short)}</span>. Add SOL, or lower the float under “what the rule may do” — the rent comes back if you ever close the register.
          </p>
        ) : null}
        {why ? (
          <p className="sp-why is-err">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
          </p>
        ) : null}
        {done ? (
          <p className="sp-why is-ok">
            <Check size={14} strokeWidth={2} aria-hidden /> {done}
          </p>
        ) : null}
        <p className="sp-q-fine">
          {!owner
            ? `Connecting is a signature, not a transaction; nothing moves. Then one signature opens your register at @${slug || "yourname"}, approves your own register as delegate for ${usd(Number(allowance || 0))}, deposits ${sol(floatLamports)} of float, and turns the rule on. Whatever USDC is there becomes the watermark; only what lands from then on is income.`
            : !view.hasBook
            ? `Starting costs ${sol(needed)}: ${sol(BigInt(view.openCostLamports))} of rent that comes back if you ever close the register, and ${sol(floatLamports)} that pays for your first ${sweepsCovered(floatLamports)} receipts. One signature opens your register at @${slug || "yourname"}, approves your own register as delegate for ${usd(Number(allowance || 0))}, and turns the rule on. Your current ${usdc(BigInt(view.usdcBalance))} is the watermark; only what lands from now is income.`
            : enabled
              ? `A new rate resets the watermark to today’s ${usdc(BigInt(view.usdcBalance))}; what already landed is not taxed. Allowance left ${usdc(BigInt(view.delegatedAmount))}; float ${sol(BigInt(view.floatLamports))}, about ${view.sweepsCovered} sweeps.`
              : `One signature: approve, float, on. Your current ${usdc(BigInt(view.usdcBalance))} becomes the watermark.`}{" "}
          Pausing is a token-program revoke. Scrip cannot stop you.
        </p>
      </section>
    </div>
  );
}
