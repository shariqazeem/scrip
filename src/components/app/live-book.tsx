"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LiveArrival, LiveView } from "@/lib/book/live-types";
import { milestonesFor, nextWholeShare } from "@/lib/book/milestones";
import { InstallPrompt, OfflineNotice } from "./offline";
import { bps, dateUTC, short, since, sol, unitsFromRaw, usd, usdc } from "@/lib/format";
import { priceWait } from "@/lib/book/waiting";
import { EmptyStub, GhostStub } from "@/components/stub/stub";
import { StubFromArrival } from "@/components/stub/from-row";
import { CopyText } from "./copy-text";
import { PauseResume } from "./pause-resume";
import "./live.css";

/**
 * THE MOMENT, LIVE.
 *
 * Polls the live view every four seconds. When the owner's USDC rises above the watermark
 * a ghost stub appears: landed, not yet swept. When a receipt for this owner appears that
 * was not there before, a real stub prints at the top of the register — the one moment of
 * motion the product has. Everything shown is read from the chain or a receipt.
 *
 * Three modes: the owner's home, the public page, and the front door (a short register
 * under the printer, nothing else).
 */
const STATE_LINE: Record<LiveView["state"], string> = {
  on: "rule on",
  paused: "paused: delegate revoked",
  "delegate-replaced": "paused: another app took the delegate",
  "allowance-exhausted": "allowance used up",
  "float-empty": "float empty",
  "no-usdc-account": "no USDC account yet",
  off: "rule off",
};

export function LiveBook({ initial, mode, site, limit, children }: { initial: LiveView; mode: "owner" | "public" | "front"; site: string; limit?: number; children?: ReactNode }) {
  const [view, setView] = useState<LiveView>(initial);
  const [printing, setPrinting] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const seen = useRef<Set<string>>(new Set(initial.arrivals.map((a) => a.id)));

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/book/live/${initial.owner}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const next = (await res.json()) as LiveView;
        const fresh = next.arrivals.find((a) => !seen.current.has(a.id));
        for (const a of next.arrivals) seen.current.add(a.id);
        setView(next);
        if (fresh) {
          setPrinting(fresh.id);
          setTimeout(() => setPrinting(null), 2_000);
        }
      } catch {
        // A missed poll is not worth a word; the next one comes in four seconds.
      }
    };
    const t = setInterval(() => void tick(), 4_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [initial.owner]);

  const asset = view.asset;
  const unswept = BigInt(view.unswept);
  const warn = view.state !== "on" && view.state !== "off";
  const payUrl = view.handle ? `${site}/pay/${view.handle}` : null;
  const publicUrl = view.handle ? `${site}/@${view.handle}` : null;
  const arrivals = limit ? view.arrivals.slice(0, limit) : view.arrivals;

  async function togglePublish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/book/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ published: !view.published }) });
      if (res.ok) setView({ ...view, published: !view.published });
    } finally {
      setPublishing(false);
    }
  }

  const register = (
    <div className={`stub-stack${mode === "front" ? " is-printed" : ""}`}>
      {unswept > 0n ? (
        <GhostStub
          landed={usdc(unswept)}
          line={view.state === "on" ? "a keeper is racing for this now; the units print with the receipt" : `nothing converts while the rule is ${STATE_LINE[view.state]}`}
          symbol={asset?.symbol ?? "stock"}
          rateBps={view.rateNowBps}
          slice={BigInt(view.sliceNext || "0") > 0n ? usdc(BigInt(view.sliceNext)) : undefined}
        />
      ) : null}
      {arrivals.length === 0 && unswept === 0n ? (
        <EmptyStub
          title="Nothing has arrived under the rule yet"
          note={view.ruleOn ? "The next USDC that lands at this address is swept within seconds, and its receipt prints here." : "Turn the rule on, and the next USDC that lands is swept with a receipt."}
        />
      ) : null}
      {arrivals.map((a: LiveArrival) => (
        <StubFromArrival key={a.id} a={a} handle={view.handle} compact printing={printing === a.id} />
      ))}
    </div>
  );

  if (mode === "front") {
    return (
      <div className="sp-front-book">
        <div className="stub-printer">
          <span className="live">
            <span className="dot" aria-hidden />
            {view.handle ? `@${view.handle}` : short(view.owner)}, live
          </span>
          <span>{view.ruleOn && asset ? `${bps(view.rateNowBps)} becomes ${asset.symbol}` : STATE_LINE[view.state]}</span>
        </div>
        {register}
        {children}
      </div>
    );
  }

  // Why nothing is settling, when the answer is the price rather than the rule. Derived from
  // the payload already polled: an equity has no price around the clock, and a register that
  // says nothing while money sits in it reads as a product that stopped.
  const waiting = priceWait({ ruleOn: view.ruleOn, unswept: view.unswept, symbol: asset?.symbol ?? null, lastReason: view.keeper.lastReason });

  return (
    <div className="sp-live">
      <header className="sp-live-head">
        {view.ruleOn && asset ? (
          <p className="sp-live-rule">
            <span className="n">{bps(view.rateNowBps)}</span> of every arrival becomes <span className="n">{asset.symbol}</span>
            {view.escalateBps > 0 ? `, rising ${bps(view.escalateBps)} every three months` : ""}.
          </p>
        ) : (
          <p className="sp-live-rule is-off">{mode === "owner" && !view.handle ? "No rule yet." : "The rule is off."}</p>
        )}
        <p className={`sp-live-watch${warn ? " is-warn" : view.state === "off" ? " is-off" : ""}`}>
          <span className="dot" aria-hidden />
          <span>watching {short(view.owner)}</span>
          <span>{waiting ? waiting.chip : STATE_LINE[view.state]}</span>
          {view.ruleOn ? <span>last sweep {view.keeper.lastSweepAt ? since(view.keeper.lastSweepAt) : view.sweeps > 0 ? `${view.sweeps} so far` : "none yet"}</span> : null}
          {view.ruleOn ? <span>allowance {usdc(BigInt(view.usdc.delegatedAmount))} left</span> : null}
          {view.ruleOn ? <span>float {sol(BigInt(view.floatLamports))}</span> : null}
        </p>
        {view.state === "delegate-replaced" ? <p className="sp-live-why">Another app set itself as the delegate on your USDC account, which paused the rule. Resume re-approves your Book and resets the watermark to today.</p> : null}
        {view.state === "allowance-exhausted" ? <p className="sp-live-why">The allowance is used up. Re-approve to keep sweeping; nothing lands until then.</p> : null}
        {view.state === "float-empty" ? <p className="sp-live-why">The float cannot cover the next receipt and tip. Top it up; nothing is lost while it waits.</p> : null}
        {waiting ? <p className="sp-live-why">{waiting.detail}</p> : null}
        {view.ruleOn && !view.keeper.alive && mode === "owner" ? <p className="sp-live-why">No keeper is reporting right now. Money that lands waits; nothing is lost.</p> : null}
        <OfflineNotice at={view.at} />
        {mode === "owner" ? (
          <div className="sp-live-actions">
            {view.ruleOn ? <PauseResume state={view.state} /> : null}
            <Link href="/app/rule" className={`sp-action${view.ruleOn ? "" : " is-primary"}`}>
              {view.ruleOn ? "Change the rule" : "Turn on the rule"}
            </Link>
            {view.handle ? (
              <button type="button" className="sp-action is-quiet" disabled={publishing} onClick={() => void togglePublish()}>
                {view.published ? "Public page on" : "Make a public page"}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <Story view={view} />

      <div className="sp-live-grid">
        <section className="sp-section">
          <p className="sp-section-label">
            <span>Arrivals, newest first</span>
            {view.arrivals.length > 0 ? <span>{view.arrivals.length}</span> : null}
          </p>
          {register}
        </section>

        <aside className="sp-live-side">
          {view.holdings.length > 0 ? (
            <section className="sp-section">
              <p className="sp-section-label">
                <span>In this wallet</span>
                <span>units first</span>
              </p>
              <div>
                {view.holdings.map((h) => (
                  <p key={h.mint} className="sp-fact">
                    <span className="k">{h.symbol}</span>
                    <span className="v is-big">
                      {unitsFromRaw(BigInt(h.qtyAdjusted), h.decimals)}
                      <span className="unit">{h.symbol}</span>
                    </span>
                  </p>
                ))}
                {view.holdings.some((h) => h.multiplier !== "1" && h.multiplier !== "unknown") ? (
                  <p className="sp-fact-note">Share-equivalents through the live multiplier. Dividends are reinvested, not paid.</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {view.vesting.length > 0 ? (
            <section className="sp-section">
              <p className="sp-section-label">
                <span>Vesting to you</span>
                <Link href="/app/holdings">every grant</Link>
              </p>
              <div>
                {view.vesting.map((g) => {
                  const total = BigInt(g.totalRaw);
                  const released = BigInt(g.releasedRaw);
                  const pct = total > 0n ? Number((released * 10_000n) / total) / 100 : 0;
                  return (
                    <p key={g.pda} className="sp-fact">
                      <span className="k">
                        <Link href={`/grant/${g.pda}`}>{g.decimals !== null ? unitsFromRaw(total, g.decimals) : g.totalRaw} {g.symbol}</Link>
                        {g.payerHandle ? ` from @${g.payerHandle}` : ""}
                      </span>
                      <span className="v">{pct.toFixed(1)}% vested{Date.now() / 1000 < g.startUnix + g.cliffSecs ? `, cliff ${dateUTC(g.startUnix + g.cliffSecs)}` : ""}</span>
                    </p>
                  );
                })}
                <p className="sp-fact-note">In an escrow the payer created, that you can see, and that the payer cannot spend. While it vests, dividends reinvest into it.</p>
              </div>
            </section>
          ) : null}

          <StillHeld view={view} />

          <Milestones view={view} mode={mode} site={site} />

          {mode === "owner" && payUrl ? (
            <section className="sp-section">
              <p className="sp-section-label">
                <span>Your pay link, for invoices and gifts</span>
              </p>
              <div className="sp-linkline">
                <span className="sp-url">{payUrl}</span>
                <CopyText text={payUrl} label="Copy" />
              </div>
              <p className="sp-fact-note">
                Most money does not need it. Send USDC to your normal address and the rule handles it. Add <span className="mono">?amount=50&amp;reason=…</span> to
                request a sum.
              </p>
            </section>
          ) : null}

          {mode === "owner" && view.published && publicUrl ? (
            <section className="sp-section">
              <p className="sp-section-label">
                <span>Your public page</span>
              </p>
              <div className="sp-linkline">
                <span className="sp-url">{publicUrl}</span>
                <CopyText text={publicUrl} label="Copy" />
              </div>
              <p className="sp-fact-note">Anyone can watch arrivals settle here. Turn it off any time.</p>
              <InstallPrompt />
            </section>
          ) : null}

          {mode === "public" && view.handle ? (
            <section className="sp-section">
              <p className="sp-section-label">
                <span>Pay this book</span>
              </p>
              <p className="sp-fact-note">
                Send USDC to <span className="mono">{view.owner}</span> and watch the rule sweep it, or{" "}
                <Link href={`/pay/${view.handle}`}>pay @{view.handle} with a reason on the receipt</Link>.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * THE STORY OF THIS WALLET, from its receipts: what landed, what became stock, what it is
 * worth today, and the staircase of ownership rising with every arrival. Every point is a
 * receipt; the price is Jupiter's, for display.
 */
function Story({ view }: { view: LiveView }) {
  const sweeps = view.arrivals.filter((a) => a.kind === "sweep");
  const all = view.arrivals;
  if (all.length === 0) return null;
  const landed = sweeps.reduce((n, a) => n + BigInt(a.basisUsdc), 0n);
  const paid = all.reduce((n, a) => n + BigInt(a.paidUsdc), 0n);
  const asset = view.asset;
  const mine = asset ? all.filter((a) => a.asset === asset.mint) : [];
  const units = mine.reduce((n, a) => n + BigInt(a.amountRaw), 0n);
  const first = Math.min(...all.map((a) => a.settledUnix));
  const worth = asset && view.priceUsd !== null && asset.decimals !== null ? (Number(units) / 10 ** asset.decimals) * view.priceUsd : null;

  return (
    <section className="sp-story">
      <p className="sp-section-label">
        <span>Since {dateUTC(first)}</span>
        <span>{all.length} receipt{all.length === 1 ? "" : "s"}</span>
      </p>
      <div className="sp-story-grid">
        <div className="sp-story-facts">
          {landed > 0n ? <Fact k="Landed under the rule" v={usdc(landed)} /> : null}
          <Fact k="Became stock" v={usdc(paid)} />
          {asset && asset.decimals !== null ? <Fact k={`${asset.symbol} from receipts`} v={unitsFromRaw(units, asset.decimals)} big /> : null}
          {worth !== null ? <Fact k="Worth today, on Jupiter" v={usd(worth)} note={worth >= Number(paid) / 1e6 ? "above what went in" : "below what went in"} tone={worth >= Number(paid) / 1e6 ? "ok" : "err"} /> : null}
        </div>
        {asset && asset.decimals !== null && mine.length > 0 ? <Staircase arrivals={mine} decimals={asset.decimals} symbol={asset.symbol} /> : null}
      </div>
    </section>
  );
}

/**
 * WHAT ALREADY HAPPENED, and the one honest sentence about what has not. A milestone is a
 * fact crossed by a receipt, with the receipt named; the next-share line is arithmetic on
 * this register's own receipts, labelled as arithmetic and promising nothing. No badges,
 * no streaks, no confetti: the card is the stub with one line above it.
 */
function Milestones({ view, mode, site }: { view: LiveView; mode: "owner" | "public" | "front"; site: string }) {
  const reached = milestonesFor(view);
  const next = nextWholeShare(view);
  if (reached.length === 0 && !next) return null;
  const share = mode !== "front" && view.handle && view.published;
  return (
    <section className="sp-section">
      <p className="sp-section-label">
        <span>Moments</span>
        <span>from receipts</span>
      </p>
      <div className="sp-moments">
        {reached.map((m) => (
          <p key={m.id} className="sp-moment">
            <span className="k">
              <Link href={`/receipt/${m.sig}`}>{m.line}</Link>
              {share ? (
                <>
                  {" "}
                  <a className="sp-moment-share" href={`${site}/m/@${view.handle}/${m.id}`}>
                    share
                  </a>
                </>
              ) : null}
            </span>
            <span className="v">{dateUTC(m.atUnix)}</span>
          </p>
        ))}
        {next ? (
          <p className="sp-moment is-next">
            <span className="k">{next.line}</span>
            <span className="v">{next.sub}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Fact({ k, v, note, big, tone }: { k: string; v: string; note?: string; big?: boolean; tone?: "ok" | "err" }) {
  return (
    <p className="sp-fact">
      <span className="k">{k}</span>
      <span className={`v${big ? " is-big" : ""}${tone ? ` is-${tone}` : ""}`}>
        {v}
        {note ? <span className="unit">{note}</span> : null}
      </span>
    </p>
  );
}

/** Cumulative units over time, one step per receipt. Server-free SVG from real points. */
function Staircase({ arrivals, decimals, symbol }: { arrivals: readonly LiveArrival[]; decimals: number; symbol: string }) {
  const pts = [...arrivals].sort((a, b) => a.settledUnix - b.settledUnix);
  const W = 320;
  const H = 120;
  const t0 = pts[0]!.settledUnix;
  const t1 = Math.max(pts[pts.length - 1]!.settledUnix, t0 + 1);
  const now = Math.floor(Date.now() / 1000);
  const tEnd = Math.max(t1, now);
  const span = Math.max(tEnd - t0, 1);
  let acc = 0n;
  const total = pts.reduce((n, a) => n + BigInt(a.amountRaw), 0n);
  const x = (t: number) => 8 + ((t - t0) / span) * (W - 16);
  const y = (v: bigint) => H - 8 - (total > 0n ? (Number(v) / Number(total)) * (H - 24) : 0);
  let d = `M ${x(t0).toFixed(1)} ${y(0n).toFixed(1)}`;
  const ticks: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const px = x(p.settledUnix);
    d += ` L ${px.toFixed(1)} ${y(acc).toFixed(1)}`;
    acc += BigInt(p.amountRaw);
    d += ` L ${px.toFixed(1)} ${y(acc).toFixed(1)}`;
    ticks.push({ x: px, y: y(acc) });
  }
  d += ` L ${x(tEnd).toFixed(1)} ${y(acc).toFixed(1)}`;
  return (
    <figure className="sp-stairs">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${unitsFromRaw(total, decimals)} ${symbol} accumulated over ${pts.length} receipts`}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
        {ticks.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r="2.5" fill="currentColor" />
        ))}
      </svg>
      <figcaption>
        <span>{dateUTC(t0)}</span>
        <span>
          {unitsFromRaw(total, decimals)} {symbol}
        </span>
        <span>today</span>
      </figcaption>
    </figure>
  );
}

/** Of what arrived, still held: receipts' units against the balance, per asset, in raw units. */
function StillHeld({ view }: { view: LiveView }) {
  const delivered = new Map<string, bigint>();
  for (const a of view.arrivals) delivered.set(a.asset, (delivered.get(a.asset) ?? 0n) + BigInt(a.amountRaw));
  const rows = [...delivered.entries()].map(([mint, total]) => {
    const h = view.holdings.find((x) => x.mint === mint);
    const bal = h ? BigInt(h.qtyRaw) : 0n;
    const kept = bal < total ? bal : total;
    const sym = h?.symbol ?? view.arrivals.find((a) => a.asset === mint)?.symbol ?? short(mint);
    return { mint, sym, bps: total > 0n ? Number((kept * 10_000n) / total) : 0 };
  });
  if (rows.length === 0) return null;
  return (
    <section className="sp-section">
      <p className="sp-section-label">
        <span>Of what arrived, still held</span>
        <Link href="/docs/keep-rate">how it is measured</Link>
      </p>
      <div>
        {rows.map((r) => (
          <p key={r.mint} className="sp-fact">
            <span className="k">{r.sym}</span>
            <span className="v is-big">{bps(r.bps)}</span>
          </p>
        ))}
        <p className="sp-fact-note">Receipts against the balance now, in raw units. The chain records it at 7 and 30 days.</p>
      </div>
    </section>
  );
}
