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
  FIRST_SWEEP_LAMPORTS,
  SUGGESTED_FLOAT_LAMPORTS,
  SWEEP_COST_LAMPORTS,
  preview,
  sweepsCovered,
  validateRule,
} from "@/lib/rule/slice";
import { signRuleAction } from "./sign-rule";
import { ExampleStub } from "@/components/stub/stub";
import { CopyText } from "@/components/app/copy-text";
import { QrClient } from "@/components/pay/qr-client";
import "./rule.css";
import { useTxToast } from "@/components/toast/use-tx-toast";

type AssetOpt = { mint: string; symbol: string; name: string; label: string; singleName: boolean; xstocks: boolean; issuer: string; kind: string };
type View = {
  hasBook: boolean;
  slug: string | null;
  assetMint: string | null;
  state: string;
  rule: { enabled: boolean; rateBps: number; escalateBps: number; floorUsdc: string; capUsdc: string; toleranceBps: number } | null;
  usdcBalance: string;
  usdcExists: boolean;
  /** Rent for the USDC account the turn-on signature opens when it is missing; "0" when it exists. */
  usdcAccountRentLamports: string;
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
const SIGNED_OUT: View = { hasBook: false, slug: null, assetMint: null, state: "off", rule: null, usdcBalance: "0", usdcExists: true, usdcAccountRentLamports: "0", delegatedAmount: "0", floatLamports: "0", sweepsCovered: 0, ownerLamports: "0", openCostLamports: "0" };

/** A name for an owner who chose none: their address, lowercased, behind an "s". Unique in practice; the program refuses a taken one. */
export function nameFromAddress(owner: string): string {
  return `s${normalizeSlug(owner).slice(0, 11)}`;
}

export function RuleEditor({
  owner,
  view: viewIn,
  assets,
  prices = {},
  solPrice = null,
  initialAsset = null,
}: {
  owner: string | null;
  view: View | null;
  assets: AssetOpt[];
  prices?: Record<string, number>;
  /** SOL in dollars on Jupiter, for DISPLAY: what a receipt costs in money a person reads. */
  solPrice?: number | null;
  /** The stock a save's receipt asked about: "do this with every payment". */
  initialAsset?: string | null;
}) {
  const router = useRouter();
  const view: View = viewIn ?? SIGNED_OUT;
  const r = view.rule;
  const enabled = !!r?.enabled;
  const [slug, setSlug] = useState(view.slug ?? "");
  const asked = initialAsset && assets.some((a) => a.mint === initialAsset) ? initialAsset : null;
  const [assetMint, setAssetMint] = useState(view.assetMint ?? asked ?? assets[0]?.mint ?? "");
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
  useTxToast(why ? "failed" : done ? "done" : busy ? "signing" : "idle", busy === "start" || busy === "enable" ? "Save every payment" : busy ? "Change your saving" : "Saving", { href: done ? `/receipt/${done}` : undefined, detail: why ?? undefined });

  // The answer survives the wallet popup: chosen signed out, kept through sign-in.
  useEffect(() => {
    if (viewIn?.hasBook) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem("scrip.rule") ?? "null") as { rateBps?: number; slug?: string; assetMint?: string; custom?: boolean } | null;
      if (saved?.rateBps) setRateBps(saved.rateBps);
      if (saved?.custom) setCustom(true);
      if (saved?.slug) setSlug(saved.slug);
      if (saved?.assetMint && !asked && assets.some((a) => a.mint === saved.assetMint)) setAssetMint(saved.assetMint);
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
  // The name a person says: "S&P 500", "Nvidia". The ticker stays in the small print.
  const label = asset.label;
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
  // A name is optional: an empty one is made from the address when the signature is built.
  const slugCheck = view.hasBook || slug === "" ? null : validateSlug(slug);
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
  const usdcRent = BigInt(view.usdcAccountRentLamports || "0");
  const needed = (view.hasBook ? 0n : BigInt(view.openCostLamports || "0")) + usdcRent + floatLamports + FEE_HEADROOM;
  const short = owner !== null && ownerLamports < needed ? needed - ownerLamports : 0n;
  // What starting costs, in the three parts a person can weigh: a deposit that comes back, the
  // receipts they prepay, and the one fee. None of it is Scrip's.
  const deposit = (view.hasBook ? 0n : BigInt(view.openCostLamports || "0")) + usdcRent;
  // One prepaid receipt, rounded up to what the field can hold (four decimals of SOL).
  const liteFloat = ((FIRST_SWEEP_LAMPORTS + 99_999n) / 100_000n) * 100_000n;
  const liteNeeded = deposit + liteFloat + FEE_HEADROOM;
  const receipts = (lamports: bigint) => {
    const n = sweepsCovered(lamports);
    return n === 1 ? "your first save" : `your first ${n} saves`;
  };
  // Waiting for SOL is a step, not an error: while this wallet is short, ask the server again
  // every few seconds, so the page notices the deposit the moment it lands.
  useEffect(() => {
    if (short === 0n || !owner) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [short, owner, router]);
  const [wasShort, setWasShort] = useState(false);
  useEffect(() => {
    if (short > 0n) setWasShort(true);
  }, [short]);

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
  const canStart = validity.ok && (view.hasBook || slugCheck === null || slugCheck.ok) && (!needsAttest || attest) && allowanceUsdc > 0n;
  const chosenSlug = slug || (owner ? nameFromAddress(owner) : "");

  return (
    <div className="sp-rulepage">
      {/* ── the one question ─────────────────────────────────────────────── */}
      <section className="sp-q">
        <p className="sp-q-label">{enabled ? "You save" : "How much of every payment do you want to save?"}</p>
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
              A <span className="mono">$500</span> payment saves <span className="mono">{usdc(example.value.slice)}</span> into {label}. <span className="mono">{usdc(500_000_000n - example.value.slice)}</span> stays USDC, untouched.
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
              symbol={label}
              when="in your own wallet, seconds later"
              foot={
                previewUnits
                  ? `Arithmetic at ${label} (${asset.symbol}) $${assetPrice!.toLocaleString("en-US", { maximumFractionDigits: 2 })} on Jupiter, for display. Your first real receipt replaces this.`
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
              Each automatic save costs {sol(SWEEP_COST_LAMPORTS)}
              {solPrice ? `, about ${usd((Number(SWEEP_COST_LAMPORTS) / 1e9) * solPrice)} at today’s SOL price` : ""}: 0.0005 SOL to whoever submits it,
              and the rest a deposit for its receipt, which stays on chain. Scrip waits until there is at least $2 to save, so a few small
              payments become one save.
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
            <span className="k">Name, optional</span>
            <span className="v">
              <span className="sp-q-at">@</span>
              <input className="sp-input is-mono" placeholder={owner ? nameFromAddress(owner) : "yourname"} value={slug} onChange={(e) => setSlug(normalizeSlug(e.target.value))} aria-label="Name, optional" />
            </span>
            <span className="note">
              {slugCheck && !slugCheck.ok
                ? slugCheck.why
                : `Your pay link: /pay/${chosenSlug || "yourname"}. Leave it empty and Scrip uses one made from your address. It cannot be changed later.`}
            </span>
          </label>
        ) : null}
        <div className="sp-q-row">
          <span className="k">Into</span>
          <span className="v">
            <span className="sp-choices">
              {assets
                .filter((a) => !a.singleName || a.mint === assetMint)
                .map((a) => (
                  <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={`${a.name} (${a.symbol})`}>
                    {a.label}
                  </button>
                ))}
              <details className="sp-q-more" open={asset.singleName}>
                <summary className="sp-choice">one company…</summary>
                <span className="sp-choices" style={{ marginTop: 8 }}>
                  {assets
                    .filter((a) => a.singleName)
                    .map((a) => (
                      <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={`${a.name} (${a.symbol})`}>
                        {a.label}
                      </button>
                    ))}
                </span>
              </details>
            </span>
          </span>
          <span className="note">
            {label} ({asset.symbol}), issued by {asset.issuer}.{asset.singleName ? " One company is your choice, never a default; after-hours trading can be thin." : ""}
            {asset.kind === "metal" ? " Priced in market hours, so saves wait outside them." : ""}
            {view.hasBook && view.assetMint !== asset.mint ? " Switching counts only payments that land from now." : ""}
          </span>
        </div>
        {needsAttest ? (
          <label className="sp-check">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
            <span>
              I am not a US person, and I understand that {label} here is a token issued by {asset.issuer}, which can freeze or move it, and
              that dividends are reinvested, not paid.
            </span>
          </label>
        ) : null}
      </section>

      {/* ── what the rule may do: defaults, folded ──────────────────────── */}
      <details className="sp-q-advanced">
        <summary>
          Limits <span className="mono">· at most {usd(Number(allowance || 0))} in total · {cap ? `${usd(Number(cap))} per payment` : "no cap per payment"} · {floor ? `keep ${usd(Number(floor))}` : "no floor"}</span>
        </summary>
        <div className="sp-q-advanced-body">
          {!enabled ? (
            <>
              <label className="sp-q-row">
                <span className="k">Limit</span>
                <span className="v">
                  <span className="sp-input-wrap">
                    <span className="sp-input-prefix">$</span>
                    <input className="sp-input is-mono" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9.]/g, ""))} />
                  </span>
                </span>
                <span className="note">
                  The most Scrip can ever move from this wallet in total, only into {label}, only into this same wallet, never to anyone else. When it
                  is used up, saving pauses until you sign a new limit; Scrip cannot raise it for you. Stopping is one instruction on the token
                  program, and Scrip cannot block it.
                </span>
              </label>
            </>
          ) : null}
          <label className="sp-q-row">
            <span className="k">Most per payment</span>
            <span className="v">
              <span className="sp-input-wrap">
                <span className="sp-input-prefix">$</span>
                <input className="sp-input is-mono" inputMode="decimal" placeholder="none" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ""))} />
              </span>
            </span>
            <span className="note">The most of one payment that counts. A large move between your own wallets is not saved in full.</span>
          </label>
          <label className="sp-q-row">
            <span className="k">Keep at least</span>
            <span className="v">
              <span className="sp-input-wrap">
                <span className="sp-input-prefix">$</span>
                <input className="sp-input is-mono" inputMode="decimal" placeholder="none" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ""))} />
              </span>
            </span>
            <span className="note">Saving never takes your USDC below this.</span>
          </label>
          <label className="sp-q-row">
            <span className="k">Price protection</span>
            <span className="v">
              <input type="range" min={50} max={300} step={10} value={toleranceBps} className="sp-range" onChange={(e) => setToleranceBps(Number(e.target.value))} aria-label="Tolerance" />
              <span className="mono">{fmtBps(toleranceBps)}</span>
            </span>
            <span className="note">How far below Pyth&rsquo;s price a fill may land. A worse fill undoes the whole save, and only you can loosen it.</span>
          </label>
          <label className="sp-check">
            <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
            <span>Add 1% every three months, up to 50%. A raise is easiest to save when it arrives; you can turn this off any time.</span>
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
        {owner && !enabled ? (
          <p className="sp-q-trust">
            Your stock stays in your wallet. Scrip can move at most {usd(Number(allowance || 0))} of your USDC, only into {label} in this wallet, and
            cannot raise that limit without a new signature from you. Stop any time.
          </p>
        ) : null}
        {owner && !view.usdcExists && !enabled ? (
          <p className="sp-q-cost-foot">This wallet has never held USDC, so the same signature opens its USDC account — {sol(usdcRent)} of rent that stays yours.</p>
        ) : null}
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
            onClick={() => void run("start", { action: "start", slug: chosenSlug, assetMint: asset.mint, termsVersion: asset.xstocks ? 1 : 0, terms: termsBody, allowanceUsdc: allowanceUsdc.toString(), floatLamports: floatLamports.toString() }, `Saving is on. Every payment from now saves ${fmtBps(rateBps)}.`, goHome)}
          >
            {busy === "start" ? "Waiting for your wallet…" : `Save ${fmtBps(rateBps)} of every payment`}
          </button>
        ) : !enabled ? (
          <button
            type="button"
            className="sp-action is-primary is-big"
            disabled={busy !== null || !canStart || short > 0n}
            onClick={() => void run("enable", { action: "enable", terms: termsBody, allowanceUsdc: allowanceUsdc.toString(), floatLamports: floatLamports.toString() }, `Saving is on. Every payment from now saves ${fmtBps(rateBps)}.`, goHome)}
          >
            {busy === "enable" ? "Waiting for your wallet…" : `Save ${fmtBps(rateBps)} of every payment`}
          </button>
        ) : (
          <div className="sp-actions">
            <button type="button" className="sp-action is-primary is-big" disabled={busy !== null || !validity.ok} onClick={() => void run("change", { action: "change", terms: termsBody }, "Changed.", goHome)}>
              {busy === "change" ? "Waiting for your wallet…" : `Change to ${fmtBps(rateBps)}`}
            </button>
            {view.assetMint !== asset.mint ? (
              <button type="button" className="sp-action" disabled={busy !== null || (needsAttest && !attest)} onClick={() => void run("asset", { action: "asset", assetMint: asset.mint, termsVersion: asset.xstocks ? 1 : 0 }, `Now saving into ${label}.`)}>
                {busy === "asset" ? "Waiting…" : `Save into ${label} instead`}
              </button>
            ) : null}
            <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("allowance", { action: "allowance", allowanceUsdc: allowanceUsdc.toString() }, "Limit set.")}>
              {busy === "allowance" ? "Waiting…" : `Set the limit to ${usd(Number(allowance || 0))}`}
            </button>
            <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("float", { action: "float", lamports: floatLamports.toString() }, "More saves prepaid.")}>
              {busy === "float" ? "Waiting…" : `Prepay more saves (${sol(floatLamports)})`}
            </button>
            <button type="button" className="sp-action is-quiet" disabled={busy !== null} onClick={() => void run("disable", { action: "disable" }, "Stopped. Your stock stays in your wallet, and Scrip can no longer move your USDC.", goHome)}>
              {busy === "disable" ? "Waiting…" : "Stop saving"}
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
              <span className="mono">{sol(BigInt(view.openCostLamports))}</span> a deposit that opens your savings record and its name —{" "}
              <strong>it comes back</strong> if you ever close them.
            </p>
            {usdcRent > 0n ? (
              <p className="sp-q-cost-row">
                <span className="mono">{sol(usdcRent)}</span> a deposit for your USDC account, opened in the same signature — yours, like any token account.
              </p>
            ) : null}
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
              prepaid for {receipts(floatLamports)}. Each automatic save
              writes a receipt that stays on chain, and whoever submits it is paid a tip.
            </p>
            <p className="sp-q-cost-foot">
              None of this is invested, and none of it goes to Scrip. The prepaid part sits on your own savings record, and you can
              withdraw what is unused at any time.
            </p>
          </div>
        ) : null}
        {short > 0n ? (
          <section className="sp-q-fund" aria-live="polite">
            <p className="sp-q-fund-h">
              <span>{ownerLamports === 0n ? "This wallet has no SOL yet" : "This wallet needs a little more SOL"}</span>
              <span className="mono">
                add {sol(short)}
                {solPrice ? <span className="sp-q-fund-usd"> about {usd((Number(short) / 1e9) * solPrice)}</span> : null}
              </span>
            </p>
            <p className="sp-q-fund-p">
              Solana asks for a small deposit before anything is created in your name, and your first receipts are prepaid. None of it is
              paid to Scrip.
            </p>
            <div className="sp-q-fund-rows">
              {deposit > 0n ? (
                <p>
                  <span className="mono">{sol(deposit)}</span>
                  <span>
                    deposit for your savings record{usdcRent > 0n ? ", its name and your USDC account" : " and its name"}. It comes back if you
                    ever close them.
                  </span>
                </p>
              ) : null}
              <p>
                <span className="mono">{sol(floatLamports)}</span>
                <span>prepaid for {receipts(floatLamports)}. What is unused, you can withdraw at any time.</span>
              </p>
              <p>
                <span className="mono">{sol(FEE_HEADROOM)}</span>
                <span>the network fee for the one signature.</span>
              </p>
            </div>
            <div className="sp-q-fund-send">
              <div className="sp-q-fund-where">
                <p className="sp-q-fund-k">Send SOL to this wallet, from an exchange or another wallet</p>
                <p className="mono sp-q-fund-addr">{owner}</p>
                <CopyText text={owner ?? ""} label="Copy address" />
                <p className="sp-q-fund-watch">
                  <span className="dot" aria-hidden />
                  Waiting for SOL. This page checks every few seconds.
                </p>
              </div>
              <QrClient
                text={`solana:${owner}?amount=${(Math.ceil(Number(short) / 1e5) / 1e4).toFixed(4)}&label=${encodeURIComponent("Scrip")}&message=${encodeURIComponent("Deposit to start saving")}`}
                size={132}
                label={`Send ${sol(short)} to this wallet with a phone wallet`}
              />
            </div>
            {floatLamports > liteFloat ? (
              <p className="sp-q-fund-lite">
                Short on SOL?{" "}
                <button type="button" className="sp-q-fund-link" onClick={() => setFloatSol((Number(liteFloat) / 1e9).toFixed(4))}>
                  Prepay one save instead
                </button>
                , and starting needs {sol(liteNeeded)}. You can add more later.
              </p>
            ) : null}
          </section>
        ) : owner && wasShort && !enabled ? (
          <p className="sp-q-fund-ready">SOL arrived. You can start saving.</p>
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
            ? `Connecting moves nothing: it is a signature, not a transaction. Then one signature opens your savings record, lets it move up to ${usd(Number(allowance || 0))} of your USDC into ${label} in this wallet, prepays ${receipts(floatLamports)}, and starts saving. The USDC already in the wallet stays as it is; only payments that land from then on are saved.`
            : !view.hasBook
            ? `Starting costs ${sol(needed)}: a ${sol(deposit)} deposit that comes back if you ever close your savings record, and ${sol(floatLamports)} that prepays ${receipts(floatLamports)}. One signature opens it at @${chosenSlug}, lets it move up to ${usd(Number(allowance || 0))} of your USDC into ${label}, and starts saving. Your current ${usdc(BigInt(view.usdcBalance))} stays as it is; only what lands from now is saved.`
            : enabled
              ? `A new rate counts from today; what already landed is not saved again. Limit left ${usdc(BigInt(view.delegatedAmount))}; about ${view.sweepsCovered} saves prepaid.`
              : `One signature sets the limit, prepays saves and starts saving. Your current ${usdc(BigInt(view.usdcBalance))} stays as it is.`}{" "}
          Stopping is one instruction on the token program, and Scrip cannot block it.
        </p>
      </section>
    </div>
  );
}
