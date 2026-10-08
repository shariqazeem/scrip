"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, X } from "lucide-react";
import type { WalletAccount } from "@wallet-standard/base";
import type { StartCardProps, StartStock } from "@/lib/start/card";
import { signInWith } from "@/lib/session/sign-in";
import { type Sendable, fromBase64, signAll, signAndSend, toBase64 } from "@/lib/wallet/client";
import { type FormPhase, useTxToast } from "@/components/toast/use-tx-toast";
import { QrClient } from "@/components/pay/qr-client";
import { CopyText } from "@/components/app/copy-text";
import { isPhone, rememberWallet, rememberedWallet, silentConnect, useWallets, walletBrowseLinks } from "@/components/save/wallets";
import { dayMonth, dollars, solInMoney, unitsText } from "@/components/save/types";
import "@/components/save/save.css";
import "./start.css";

/**
 * START SAVING — THE ONE FLOW. One question (how much of every payment), one stock, a first
 * save so stock lands today, and one button. The wallet is asked twice at most: once to sign
 * in, once to approve, and that approval turns on every payment, makes the first save and joins
 * any Plan a sponsor invited this wallet to (`lib/start/build.ts`). The limit, the prepaid saves
 * and the name keep the defaults the rule page used; changing them is for later, not for now.
 *
 * What a person must know before signing is on the card itself, above the button: where the
 * stock goes, what Scrip can move, who issues the stock and what they can do, and what
 * starting sets aside. Nothing here is a number the chain or Jupiter did not give.
 */
const RATES = [
  { bps: 500, note: "a start" },
  { bps: 1000, note: "the default" },
  { bps: 2000, note: "ambitious" },
] as const;
const FIRST = [5, 10, 25] as const;
/** The chips under "Into": the stocks a payment can save into, ready ones first. */
const MAX_STOCK_CHIPS = 4;

type Phase = "idle" | "connecting" | "building" | "signing" | "confirming" | "done" | "failed";
type Invite = { plan: string; sponsorName: string | null; matchBps: number; monthlyCapUsdc: string; stock: string; suggestedRateBps: number };
type WalletView = {
  saving: { rateBps: number; enabled: boolean; state: string; stock: string | null; slug: string } | null;
  usdc: string;
  lamports: string;
  needLamports: string;
  invites: Invite[];
};
type Connected = { wallet: Sendable; account: WalletAccount };
type Done = { sig: string; settled: boolean; rateBps: number; stockName: string; first: { usd: number; units: string | null } | null; joined: Invite[] };

export function StartCard({ stocks, defaultMint, solUsd, cluster, firstQuote, compact = false }: StartCardProps & { compact?: boolean }) {
  const wallets = useWallets();
  const [rateBps, setRateBps] = useState(1000);
  const [rateTouched, setRateTouched] = useState(false);
  const [mint, setMint] = useState(defaultMint);
  const [firstOn, setFirstOn] = useState(true);
  const [firstUsd, setFirstUsd] = useState<number>(5);
  const [connected, setConnected] = useState<Connected | null>(null);
  const [view, setView] = useState<WalletView | null>(null);
  const [lastPaid, setLastPaid] = useState<{ at: number; usdc: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [firstUnits, setFirstUnits] = useState<{ key: string; units: string } | null>(() => {
    const def = stocks.find((x) => x.mint === firstQuote?.mint);
    return firstQuote && def ? { key: `${firstQuote.mint}:${firstQuote.usd}`, units: unitsText(firstQuote.outRaw, def.decimals) } : null;
  });
  const sheetRef = useRef<HTMLDialogElement>(null);

  const stock = stocks.find((s) => s.mint === mint) ?? stocks[0]!;
  const chips = useMemo(() => {
    // The default, then the S&P 500 (the index people ask for by name, shown even while it waits
    // for a price, with the note that says so), then whatever can settle now.
    const def = stocks.find((s) => s.mint === defaultMint);
    const spy = stocks.find((s) => s.ticker === "SPY" && s.mint !== defaultMint);
    const ready = stocks.filter((s) => s.ready !== false && s.mint !== defaultMint && s.mint !== spy?.mint);
    const list = [def, spy, ...ready].filter((s): s is StartStock => Boolean(s)).slice(0, MAX_STOCK_CHIPS);
    if (!list.some((s) => s.mint === mint)) list[list.length - 1] = stock;
    return list;
  }, [stocks, defaultMint, mint, stock]);
  const pct = rateBps / 100;
  const usdcHeld = view ? BigInt(view.usdc) : null;
  const holds = (usd: number) => usdcHeld === null || usdcHeld >= BigInt(usd) * 1_000_000n;
  const canFirst = holds(firstUsd);
  const firstWanted = firstOn && canFirst;
  const shortOfSol = view && !view.saving ? BigInt(view.lamports) < BigInt(view.needLamports) : false;
  const invite = view?.invites[0] ?? null;

  const toastPhase: FormPhase = phase === "connecting" || phase === "idle" ? "idle" : phase === "done" ? "done" : phase;
  useTxToast(toastPhase, `Start saving ${pct}%`, { detail: why ?? undefined, href: done && done.first ? `/receipt/${done.sig}` : undefined });

  // ── the wallet, read once it is known ─────────────────────────────────────────────────
  const readWallet = useCallback(async (address: string): Promise<WalletView | null> => {
    const [v, w] = await Promise.all([
      fetch(`/api/start/view/${address}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<WalletView>) : null)).catch(() => null),
      fetch(`/api/save/wallet/${address}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (v) setView(v);
    const latest = (w as { inflows?: Array<{ at: number; usdc: string }> } | null)?.inflows?.[0];
    if (latest && Number(latest.usdc) >= 2_000_000) setLastPaid({ at: latest.at, usdc: latest.usdc });
    return v;
  }, []);

  // A wallet that already trusts this site is known without a prompt.
  useEffect(() => {
    const name = rememberedWallet();
    const w = name ? wallets.find((x) => x.name === name) : undefined;
    if (!w || connected) return;
    void silentConnect(w).then((address) => {
      const account = address ? w.accounts.find((a) => a.address === address) : undefined;
      if (!account) return;
      setConnected({ wallet: w, account });
      void readWallet(account.address);
    });
  }, [wallets, connected, readWallet]);

  // A sponsor's suggested rate, until the person chooses their own.
  useEffect(() => {
    if (invite && !rateTouched && RATES.some((r) => r.bps === invite.suggestedRateBps)) setRateBps(invite.suggestedRateBps);
  }, [invite, rateTouched]);

  // What the first save becomes, from Jupiter's quote for this amount.
  useEffect(() => {
    if (!firstOn) return;
    const key = `${mint}:${firstUsd}`;
    const t = setTimeout(() => {
      void fetch(`/api/save/quote?mint=${mint}&usd=${firstUsd}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((q: { quote?: { outRaw: string } } | null) => {
          if (q?.quote) setFirstUnits({ key, units: unitsText(q.quote.outRaw, stock.decimals) });
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [mint, firstUsd, firstOn, stock.decimals]);
  const units = firstUnits && firstUnits.key === `${mint}:${firstUsd}` ? firstUnits.units : null;

  // While short of SOL, look again every few seconds: the card moves on by itself when it lands.
  useEffect(() => {
    if (!shortOfSol || !connected) return;
    const t = setInterval(() => void readWallet(connected.account.address), 6_000);
    return () => clearInterval(t);
  }, [shortOfSol, connected, readWallet]);

  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal();
    else if (!sheet && d.open) d.close();
  }, [sheet]);

  // ── the one button ───────────────────────────────────────────────────────────────────
  const signIn = async (w: Sendable): Promise<Connected | null> => {
    setPhase("connecting");
    setWhy(null);
    const r = await signInWith(w, { session: "when-free" });
    if (!r.ok) {
      setPhase("idle");
      setWhy(r.why || null);
      return null;
    }
    rememberWallet(w.name);
    const c = { wallet: w, account: r.value.account };
    setConnected(c);
    // No refresh here, and none at the end: on /app a signed-in render draws this card in
    // another place, which would start it over mid-flow and lose the result. "Open your
    // savings" loads the signed-in page when the person chooses to.
    return c;
  };

  const go = async (picked?: Sendable) => {
    setWhy(null);
    let c = connected;
    if (!c) {
      const w = picked ?? (wallets.length === 1 ? wallets[0] : undefined);
      if (!w) {
        setSheet(true);
        return;
      }
      setSheet(false);
      c = await signIn(w);
      if (!c) return;
    }
    setPhase("building");
    const v = await readWallet(c.account.address);
    if (!v) return fail("This wallet could not be read just now. Try again in a moment; nothing was signed.");
    if (v.saving || BigInt(v.lamports) < BigInt(v.needLamports)) {
      // The card now says which, in place: already saving, or a little SOL first.
      setPhase("idle");
      return;
    }
    const saveUsd = firstOn && BigInt(v.usdc) >= BigInt(firstUsd) * 1_000_000n ? firstUsd : 0;
    let built: { transactions: string[]; joins: number; quote: { outRaw: string } | null; error?: string };
    try {
      const res = await fetch("/api/start/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: c.account.address, assetMint: mint, rateBps, saveUsd, attested: true }),
      });
      built = await res.json();
      if (!res.ok) return fail(built.error ?? "Starting could not be prepared. Nothing was signed.");
    } catch {
      return fail("Could not reach Scrip. Nothing was signed.");
    }

    setPhase("signing");
    let sig: string;
    let settled = true;
    if (built.transactions.length === 1) {
      const sent = await signAndSend(c.wallet, c.account, fromBase64(built.transactions[0]!), cluster);
      if (!sent.ok) {
        if (sent.why) return fail(sent.why);
        setPhase("idle");
        return;
      }
      sig = sent.value;
      setPhase("confirming");
      const landed = await landedOrNot(sig);
      if (landed === "failed") return fail("It did not go through, so nothing moved. Try again in a moment.");
      settled = landed === "confirmed";
    } else {
      const signed = await signAll(c.wallet, c.account, built.transactions.map(fromBase64), cluster);
      if (!signed.ok) {
        if (signed.why) return fail(signed.why);
        setPhase("idle");
        return;
      }
      setPhase("confirming");
      const sigs: string[] = [];
      for (const raw of signed.value) {
        const res = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionBase64: toBase64(raw) }) });
        const j = (await res.json().catch(() => ({}))) as { signature?: string; error?: string };
        if (!res.ok || !j.signature) return fail(j.error ?? "It did not go through. Try again in a moment.");
        sigs.push(j.signature);
      }
      sig = sigs[0]!;
    }
    try {
      navigator.vibrate?.(24);
    } catch {
      // No haptics here.
    }
    setDone({
      sig,
      settled,
      rateBps,
      stockName: stock.name,
      first: saveUsd > 0 ? { usd: saveUsd, units: built.quote ? unitsText(built.quote.outRaw, stock.decimals) : units } : null,
      joined: built.joins > 0 ? v.invites : [],
    });
    setPhase("done");
  };

  function fail(message: string) {
    setWhy(message);
    setPhase("failed");
  }

  const busy = phase === "connecting" || phase === "building" || phase === "signing" || phase === "confirming";

  // ── what the card says, in order of what is true ─────────────────────────────────────
  if (done) return <Started done={done} compact={compact} />;
  if (view?.saving && connected) return <AlreadySaving saving={view.saving} />;

  return (
    <div className={`sp-start${compact ? " is-compact" : ""}`} id="start">
      <fieldset className="sp-start-q">
        <legend>How much of every payment becomes stock?</legend>
        <div className="sp-start-rates" role="radiogroup" aria-label="How much of every payment">
          {RATES.map((r) => (
            <button
              key={r.bps}
              type="button"
              role="radio"
              aria-checked={rateBps === r.bps}
              className={`sp-start-rate${rateBps === r.bps ? " is-selected" : ""}`}
              onClick={() => {
                setRateBps(r.bps);
                setRateTouched(true);
              }}
            >
              <span className="pct">{r.bps / 100}%</span>
              <span className="note">{r.note}</span>
            </button>
          ))}
        </div>
        <Example rateBps={rateBps} stock={stock} lastPaid={lastPaid} />
      </fieldset>

      <fieldset className="sp-save-group">
        <legend>Into</legend>
        <div className="sp-save-chips is-stocks">
          {chips.map((s) => (
            <button key={s.mint} type="button" className={`sp-save-chip${s.mint === mint ? " is-selected" : ""}`} aria-pressed={s.mint === mint} onClick={() => setMint(s.mint)}>
              {s.name}
            </button>
          ))}
        </div>
        {stock.ready === false ? (
          <p className="sp-start-note">
            Saves from your payments into {stock.name} wait for a market price right now (the newest on Solana is {stock.waited} old). Your first save below does not wait.
          </p>
        ) : null}
      </fieldset>

      <div className={`sp-start-first${firstWanted ? " is-on" : ""}`}>
        <label className="sp-start-toggle">
          <input type="checkbox" checked={firstOn} onChange={(e) => setFirstOn(e.target.checked)} />
          <span>And start with a first save now</span>
        </label>
        {firstOn ? (
          <>
            <div className="sp-save-chips">
              {FIRST.map((usd) => (
                <button
                  key={usd}
                  type="button"
                  className={`sp-save-chip${firstUsd === usd ? " is-selected" : ""}`}
                  aria-pressed={firstUsd === usd}
                  disabled={!holds(usd)}
                  onClick={() => setFirstUsd(usd)}
                >
                  ${usd}
                </button>
              ))}
            </div>
            <p className="sp-start-becomes" aria-live="polite">
              {!canFirst && usdcHeld !== null ? (
                <>This wallet holds {dollars(Number(usdcHeld) / 1e6)} of USDC, so the first save waits until a payment lands.</>
              ) : units ? (
                <>
                  {dollars(firstUsd)} becomes about <strong>{units}</strong> {stock.name} in your wallet, in seconds.
                </>
              ) : (
                <>Asking Jupiter for a price…</>
              )}
            </p>
          </>
        ) : null}
      </div>

      {invite ? (
        <p className="sp-start-match">
          <strong>{invite.sponsorName ?? "Your sponsor"}</strong> adds {invite.matchBps / 100}% of every automatic save, up to {dollars(Number(invite.monthlyCapUsdc) / 1e6)} a month, in {invite.stock}.
          Starting joins their Plan.
        </p>
      ) : null}

      {shortOfSol && connected && view ? (
        <NeedSol address={connected.account.address} have={BigInt(view.lamports)} need={BigInt(view.needLamports)} solUsd={solUsd} />
      ) : (
        <>
          <p className="sp-save-trust">
            <ShieldCheck size={16} strokeWidth={2} aria-hidden />
            <span>
              The stock lands in your own wallet. Scrip can move at most $200 of your USDC, only into {stock.name}, and you can stop any time. Starting confirms you are not a US
              person.
            </span>
          </p>
          <button type="button" className="sp-save-go" disabled={busy} onClick={() => void go()}>
            {phase === "connecting"
              ? "Sign in with your wallet…"
              : phase === "building"
                ? "Preparing…"
                : phase === "signing"
                  ? "Approve in your wallet…"
                  : phase === "confirming"
                    ? "Starting on Solana…"
                    : phase === "failed"
                      ? "Try again"
                      : `Start saving ${pct}%`}
          </button>
          {why ? <p className="sp-start-why">{why}</p> : null}
          <p className="sp-start-small">
            {stock.issuerLine} Starting sets aside about {costText(view, solUsd)}: deposits that come back if you stop, and prepaid fees for your next automatic saves.
          </p>
          {connected ? (
            <p className="sp-start-small">
              Wallet <span className="mono">{connected.account.address.slice(0, 4)}…{connected.account.address.slice(-4)}</span>.{" "}
              <button
                type="button"
                className="sp-save-textbtn"
                onClick={() => {
                  rememberWallet(null);
                  setConnected(null);
                  setView(null);
                  setLastPaid(null);
                }}
              >
                Use another wallet
              </button>
            </p>
          ) : null}
        </>
      )}

      <dialog ref={sheetRef} className="sp-save-dialog sp-save-sheet" aria-label="Choose your wallet" onClose={() => setSheet(false)} onCancel={() => setSheet(false)}>
        <div className="sp-save-dialog-head">
          <p className="sp-save-sheet-title">{wallets.length ? "Choose your wallet" : "Open in your wallet app"}</p>
          <button type="button" className="sp-save-icon-btn" onClick={() => setSheet(false)} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {sheet ? <WalletList wallets={wallets} onPick={(w) => void go(w)} /> : null}
      </dialog>
    </div>
  );
}

/** Ask the chain until it answers, for at most a minute and a half. */
async function landedOrNot(sig: string): Promise<"confirmed" | "failed" | "pending"> {
  for (let i = 0; i < 60; i += 1) {
    const r = await fetch(`/api/tx/${sig}`, { cache: "no-store" })
      .then((x) => x.json() as Promise<{ state?: string }>)
      .catch(() => null);
    if (r?.state === "confirmed") return "confirmed";
    if (r?.state === "failed") return "failed";
    await new Promise((res) => setTimeout(res, 1_500));
  }
  return "pending";
}

function costText(view: WalletView | null, solUsd: number | null): string {
  // Before a wallet is known: the rule page's own sum for a new wallet, about 0.026 SOL.
  const lamports = view && !view.saving ? Number(view.needLamports) - 890_880 : 26_000_000;
  const money = solInMoney(lamports, solUsd);
  return `${(lamports / 1e9).toFixed(3)} SOL${money ? ` (${money})` : ""}`;
}

function Example({ rateBps, stock, lastPaid }: { rateBps: number; stock: StartStock; lastPaid: { at: number; usdc: string } | null }) {
  const pay = lastPaid ? Number(lastPaid.usdc) / 1e6 : 100;
  const slice = (pay * rateBps) / 10_000;
  const units = stock.perUnitUsd ? slice / stock.perUnitUsd : null;
  const u = units ? (units >= 0.01 ? units.toFixed(4) : units.toPrecision(3)) : null;
  return (
    <p className="sp-start-example">
      {lastPaid ? (
        <>
          Your last payment, {dollars(pay)} on {dayMonth(lastPaid.at)}, would have saved <strong>{dollars(slice)}</strong>
          {u ? <> as about {u} {stock.name}</> : null}.
        </>
      ) : (
        <>
          Paid {dollars(pay)}: <strong>{dollars(slice)}</strong> becomes {u ? <>about {u} </> : null}
          {stock.name}, by itself. The other {dollars(pay - slice)} stays USDC.
        </>
      )}
    </p>
  );
}

function NeedSol({ address, have, need, solUsd }: { address: string; have: bigint; need: bigint; solUsd: number | null }) {
  const short = Number(need - have);
  const money = solInMoney(short, solUsd);
  return (
    <div className="sp-start-sol" role="status">
      <p className="title">First, a little SOL for the network</p>
      <p>
        Send at least <strong>{(short / 1e9).toFixed(3)} SOL</strong>
        {money ? ` (${money})` : ""} to this wallet. Solana charges its own network fees in SOL, and Scrip does not pay them for you; none of it goes
        to Scrip. Most of it is a deposit that comes back if you stop; the rest prepays the fees of your next automatic saves.
      </p>
      <div className="addr">
        <QrClient text={`solana:${address}`} size={112} label="This wallet's address" />
        <div>
          <p className="mono">{address}</p>
          <CopyText text={address} label="Copy the address" />
        </div>
      </div>
      <p className="checking">This card moves on by itself when the SOL arrives.</p>
    </div>
  );
}

function AlreadySaving({ saving }: { saving: NonNullable<WalletView["saving"]> }) {
  return (
    <div className="sp-start sp-start-done">
      <p className="sp-start-done-title">
        <Check size={20} strokeWidth={2} aria-hidden />
        {saving.enabled ? `You save ${saving.rateBps / 100}% of every payment` : "Saving every payment is stopped"}
      </p>
      <p className="sp-start-done-sub">{saving.enabled ? `Into ${saving.stock ?? "your stock"}, by itself, as payments land.` : "Turn it back on whenever you like."}</p>
      <div className="sp-start-done-actions">
        <Link href="/app" className="sp-save-go">
          Open your savings
        </Link>
        <Link href={saving.enabled ? "/app/save" : "/app/rule"} className="sp-start-secondary">
          {saving.enabled ? "Save more now" : "Turn it back on"}
        </Link>
      </div>
    </div>
  );
}

function Started({ done, compact }: { done: Done; compact: boolean }) {
  return (
    <div className={`sp-start sp-start-done${compact ? " is-compact" : ""}`} role="status">
      <p className="sp-start-done-title">
        <Check size={20} strokeWidth={2} aria-hidden />
        You save {done.rateBps / 100}% of every payment
      </p>
      <p className="sp-start-done-sub">
        Into {done.stockName}, by itself, as payments land. {done.settled ? "" : "Solana is still confirming it; your savings page shows it the moment it lands."}
      </p>
      {done.first ? (
        <Link href={`/receipt/${done.sig}`} className="sp-start-first-result">
          <span className="k">Your first save</span>
          <span className="v">
            {dollars(done.first.usd)} became {done.first.units ? <>about <strong>{done.first.units}</strong></> : "stock in"} {done.stockName}
          </span>
          <span className="go">The receipt has the exact amount</span>
        </Link>
      ) : null}
      {done.joined.map((j) => (
        <p key={j.plan} className="sp-start-match">
          <strong>{j.sponsorName ?? "Your sponsor"}</strong> adds {j.matchBps / 100}% of every automatic save, up to {dollars(Number(j.monthlyCapUsdc) / 1e6)} a month. You joined their Plan.
        </p>
      ))}
      <div className="sp-start-done-actions">
        {/* A full load, so the page reads the new session and the new record for certain. */}
        <button type="button" className="sp-save-go" onClick={() => window.location.assign("/app")}>
          Open your savings
        </button>
      </div>
    </div>
  );
}

function WalletList({ wallets, onPick }: { wallets: readonly Sendable[]; onPick: (w: Sendable) => void }) {
  if (wallets.length === 0) {
    const here = typeof window === "undefined" ? "https://scrip.work/" : window.location.href;
    return (
      <div className="sp-save-sheet-body">
        {isPhone() ? (
          <>
            <p className="sp-save-sheet-say">Open Scrip inside your wallet app, where starting takes one approval.</p>
            <div className="sp-save-wallets">
              {walletBrowseLinks(here).map((l) => (
                <a key={l.name} href={l.href} className="sp-save-wallet">
                  Open in {l.name}
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="sp-save-sheet-say">
            Scrip uses a Solana wallet you already have. Install <a href="https://phantom.app">Phantom</a>, <a href="https://solflare.com">Solflare</a> or{" "}
            <a href="https://backpack.app">Backpack</a>, then come back to this page.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="sp-save-sheet-body">
      <div className="sp-save-wallets">
        {wallets.map((w) => (
          <button key={w.name} type="button" className="sp-save-wallet" onClick={() => onPick(w)}>
            {w.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={w.icon} alt="" width={22} height={22} />
            ) : null}
            {w.name}
          </button>
        ))}
      </div>
    </div>
  );
}
