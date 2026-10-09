"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Loader2, ShieldCheck, X } from "lucide-react";
import type { WalletAccount } from "@wallet-standard/base";
import type { StartCardProps, StartStock } from "@/lib/start/card";
import { type FirstPayment, firstPayment } from "@/lib/start/first";
import type { Inflow } from "@/lib/save/amount";
import { signInWith } from "@/lib/session/sign-in";
import { type Sendable, fromBase64, signAndSend } from "@/lib/wallet/client";
import { type FormPhase, useTxToast } from "@/components/toast/use-tx-toast";
import { QrClient } from "@/components/pay/qr-client";
import { CopyText } from "@/components/app/copy-text";
import { AskForMatch } from "@/components/receipt/share";
import { RequestToJoin } from "@/components/plan/request-to-join";
import { Stub } from "@/components/stub/stub";
import { short, stampUTC } from "@/lib/format";
import {
  isPhone,
  rememberWallet,
  rememberedWallet,
  silentConnect,
  useWallets,
  walletBrowseLinks,
} from "@/components/save/wallets";
import { dayMonth, dollars, solInMoney, unitsText } from "@/components/save/types";
import "@/components/save/save.css";
import "./start.css";

/**
 * START SAVING — ONE SENTENCE, ONE BUTTON. "Save 10% of every payment, into the Nasdaq 100."
 *
 * Until 9 October this was a tall form (three rates, four stocks, a first save by hand with its
 * own amounts, and a trust paragraph), and what it made first was a plain swap, so a new saver
 * never saw the one thing Scrip does. Now the card asks the sentence, and once the wallet is
 * known it shows that wallet's own last payment going through the rule: "$10.10, paid 9 Oct →
 * 10%, $1.01 → Nasdaq 100". One approval turns saving on with that payment counted as arriving
 * (`lib/start/build.ts`), and the card then watches the chain until the first automatic save's
 * receipt prints in front of the saver, seconds later, or says plainly why it waits.
 *
 * The wallet is asked twice at most: to connect (and sign in, in the same prompt where the wallet
 * can), then to approve. What a person must know before approving is on the card above the
 * button: the slice and the stock, what Scrip can move, who issues the stock, what starting sets
 * aside. Nothing here is a number the chain, the wallet's history or Jupiter did not give.
 */
const RATES = [500, 1000, 2000] as const;
/** How long the card watches for the first save before handing over to the savings page. */
const WATCH_MS = 10 * 60_000;
const POLL_MS = 3_000;
/** How long the card waits for a wallet's payment history before using the USDC it holds. */
const PAYMENTS_WAIT_MS = 8_000;

type Phase = "idle" | "connecting" | "building" | "signing" | "confirming" | "done" | "failed";
type Invite = {
  plan: string;
  sponsorName: string | null;
  matchBps: number;
  monthlyCapUsdc: string;
  stock: string;
  suggestedRateBps: number;
};
type WalletView = {
  saving: {
    rateBps: number;
    enabled: boolean;
    state: string;
    stock: string | null;
    slug: string;
  } | null;
  usdc: string;
  lamports: string;
  needLamports: string;
  invites: Invite[];
};
type Connected = { wallet: Sendable; account: WalletAccount };
type Done = {
  sig: string;
  owner: string;
  settled: boolean;
  rateBps: number;
  stock: StartStock;
  first: { basisUsdc: string; sliceUsdc: string } | null;
  joined: Invite[];
};

export function StartCard({
  stocks,
  defaultMint,
  solUsd,
  cluster,
  openPlan,
  compact = false,
}: StartCardProps & { compact?: boolean }) {
  const wallets = useWallets();
  const [rateBps, setRateBps] = useState(1000);
  const [rateTouched, setRateTouched] = useState(false);
  const [mint, setMint] = useState(defaultMint);
  const [connected, setConnected] = useState<Connected | null>(null);
  const [view, setView] = useState<WalletView | null>(null);
  const [pay, setPay] = useState<{ inflows: Inflow[]; usdc: bigint } | null>(null);
  const [skipFirst, setSkipFirst] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const stock = stocks.find((s) => s.mint === mint) ?? stocks[0]!;
  const pct = rateBps / 100;
  const shortOfSol =
    view && !view.saving ? BigInt(view.lamports) < BigInt(view.needLamports) : false;
  const invite = view?.invites[0] ?? null;
  // The payment the rule starts with, by the same arithmetic the program will do.
  const first = useMemo<FirstPayment | null>(
    () =>
      pay && !skipFirst
        ? firstPayment({
            inflows: pay.inflows,
            usdcBalance: pay.usdc,
            rateBps,
            nowUnix: Math.floor(Date.now() / 1000),
          })
        : null,
    [pay, skipFirst, rateBps],
  );
  const couldFirst = useMemo(
    () =>
      pay
        ? firstPayment({
            inflows: pay.inflows,
            usdcBalance: pay.usdc,
            rateBps,
            nowUnix: Math.floor(Date.now() / 1000),
          }) !== null
        : false,
    [pay, rateBps],
  );

  const toastPhase: FormPhase =
    phase === "connecting" || phase === "idle" ? "idle" : phase === "done" ? "done" : phase;
  useTxToast(toastPhase, `Start saving ${pct}%`, { detail: why ?? undefined });

  // ── the wallet, read once it is known ─────────────────────────────────────────────────
  const readWallet = useCallback(async (address: string): Promise<WalletView | null> => {
    // The wallet's state first: it decides what the card says. Its payments follow, and a busy
    // wallet's history must not hold the card: after a few seconds the USDC it holds stands in.
    const payments = fetch(`/api/save/wallet/${address}`, { cache: "no-store", signal: AbortSignal.timeout(PAYMENTS_WAIT_MS) })
      .then((r) => (r.ok ? (r.json() as Promise<{ usdc?: string; inflows?: Array<{ sig: string; at: number; usdc: string; from: string | null }> }>) : null))
      .catch(() => null);
    const v = await fetch(`/api/start/view/${address}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<WalletView>) : null))
      .catch(() => null);
    if (v) setView(v);
    const body = await payments;
    if (body?.usdc !== undefined) {
      setPay({ usdc: BigInt(body.usdc), inflows: (body.inflows ?? []).map((f) => ({ sig: f.sig, at: f.at, usdc: BigInt(f.usdc), from: f.from })) });
    } else if (v) {
      setPay({ usdc: BigInt(v.usdc), inflows: [] });
    }
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
    if (
      invite &&
      !rateTouched &&
      (RATES as readonly number[]).includes(invite.suggestedRateBps)
    )
      setRateBps(invite.suggestedRateBps);
  }, [invite, rateTouched]);

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
  const connect = async (w: Sendable): Promise<Connected | null> => {
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
    return c;
  };

  const go = async (picked?: Sendable) => {
    setWhy(null);
    // First tap with no wallet known: connect, read it, and show its own first payment. The
    // approval is the next tap, once the person has seen exactly what it will do.
    if (!connected) {
      const w = picked ?? (wallets.length === 1 ? wallets[0] : undefined);
      if (!w) {
        setSheet(true);
        return;
      }
      setSheet(false);
      const c = await connect(w);
      if (!c) return;
      setPhase("building");
      const v = await readWallet(c.account.address);
      setPhase("idle");
      if (!v)
        setWhy(
          "This wallet could not be read just now. Try again in a moment; nothing was signed.",
        );
      return;
    }
    const c = connected;
    setPhase("building");
    const v = await readWallet(c.account.address);
    if (!v)
      return fail(
        "This wallet could not be read just now. Try again in a moment; nothing was signed.",
      );
    if (v.saving || BigInt(v.lamports) < BigInt(v.needLamports)) {
      // The card now says which, in place: already saving, or a little SOL first.
      setPhase("idle");
      return;
    }
    let built: { transactions: string[]; joins: number; first: Done["first"]; error?: string };
    try {
      const res = await fetch("/api/start/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner: c.account.address,
          assetMint: mint,
          rateBps,
          firstUsdc: (first?.basisUsdc ?? 0n).toString(),
          attested: true,
        }),
      });
      built = await res.json();
      if (!res.ok)
        return fail(built.error ?? "Starting could not be prepared. Nothing was signed.");
    } catch {
      return fail("Could not reach Scrip. Nothing was signed.");
    }

    setPhase("signing");
    const sent = await signAndSend(
      c.wallet,
      c.account,
      fromBase64(built.transactions[0]!),
      cluster,
    );
    if (!sent.ok) {
      if (sent.why) return fail(sent.why);
      setPhase("idle");
      return;
    }
    setPhase("confirming");
    const landed = await landedOrNot(sent.value);
    if (landed === "failed")
      return fail("It did not go through, so nothing moved. Try again in a moment.");
    // Scrip's servers look now, not at their next poll: the first save prints while the saver watches.
    void fetch("/api/start/wake", { method: "POST" }).catch(() => undefined);
    try {
      navigator.vibrate?.(24);
    } catch {
      // No haptics here.
    }
    setDone({
      sig: sent.value,
      owner: c.account.address,
      settled: landed === "confirmed",
      rateBps,
      stock,
      first: built.first,
      joined: built.joins > 0 ? v.invites : [],
    });
    setPhase("done");
  };

  function fail(message: string) {
    setWhy(message);
    setPhase("failed");
  }

  const busy =
    phase === "connecting" ||
    phase === "building" ||
    phase === "signing" ||
    phase === "confirming";

  // ── what the card says, in order of what is true ─────────────────────────────────────
  if (done) return <Started done={done} compact={compact} openPlan={openPlan} />;
  if (view?.saving && connected) return <AlreadySaving saving={view.saving} />;

  return (
    <div className={`sp-go${compact ? " is-compact" : ""}`} id="start">
      <div className="sp-go-line" role="group" aria-label="What to save">
        <span className="sp-go-part">
          <span className="sp-go-word">Save</span>
          <div className="sp-go-rates" role="radiogroup" aria-label="How much of every payment">
            {RATES.map((bps) => (
              <button
                key={bps}
                type="button"
                role="radio"
                aria-checked={rateBps === bps}
                className={`sp-go-rate${rateBps === bps ? " is-selected" : ""}`}
                onClick={() => {
                  setRateBps(bps);
                  setRateTouched(true);
                }}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
          <span className="sp-go-word">of every payment,</span>
        </span>
        <span className="sp-go-part">
          <span className="sp-go-word">into</span>
          <StockPicker stocks={stocks} mint={mint} onPick={setMint} />
        </span>
      </div>

      {connected && !pay && !shortOfSol ? (
        <div className="sp-go-first is-next">
          <p className="sp-go-first-title">Reading this wallet&rsquo;s last payment…</p>
        </div>
      ) : connected && pay && !shortOfSol ? (
        <FirstPanel
          first={first}
          couldFirst={couldFirst}
          rateBps={rateBps}
          stock={stock}
          skip={() => setSkipFirst(true)}
          unskip={() => setSkipFirst(false)}
          skipped={skipFirst}
        />
      ) : !connected ? (
        <p className="sp-go-how">
          Every payment that lands in your wallet saves {pct}% of itself as {stock.name},
          seconds after it lands. Connect your wallet to watch it happen with your last payment.
        </p>
      ) : null}

      {invite ? (
        <p className="sp-start-match">
          <strong>{invite.sponsorName ?? "Your sponsor"}</strong> adds {invite.matchBps / 100}%
          of every automatic save, up to {dollars(Number(invite.monthlyCapUsdc) / 1e6)} a month,
          in {invite.stock}. Starting joins their Plan.
        </p>
      ) : openPlan && connected && connected.account.address !== openPlan.sponsor ? (
        // Scrip's own Plan while it has room: said before anyone starts, and said as it is — a
        // request after starting, read by a person, not a match that comes with the start.
        <p className="sp-start-offer">
          <strong>Scrip matches its first savers:</strong> {openPlan.matchBps / 100}% of every
          automatic save, up to {dollars(openPlan.capUsd)} a month, in {openPlan.stockName}.
          After you start, ask to join.
        </p>
      ) : null}

      {shortOfSol && connected && view ? (
        <NeedSol
          address={connected.account.address}
          have={BigInt(view.lamports)}
          need={BigInt(view.needLamports)}
          solUsd={solUsd}
        />
      ) : (
        <>
          <button
            type="button"
            className="sp-save-go"
            disabled={busy}
            onClick={() => void go()}
          >
            {phase === "connecting"
              ? "Connect in your wallet…"
              : phase === "building"
                ? connected && pay
                  ? "Preparing…"
                  : "Reading your wallet…"
                : phase === "signing"
                  ? "Approve in your wallet…"
                  : phase === "confirming"
                    ? "Starting on Solana…"
                    : phase === "failed"
                      ? "Try again"
                      : `Start saving ${pct}%`}
          </button>
          {why ? <p className="sp-start-why">{why}</p> : null}
          {connected?.wallet.name === "Phantom" && !why ? (
            // Said before the wallet says it, so it reads as expected rather than as an alarm.
            <p className="sp-go-heads">
              Phantom may show a red warning that this site asks to move funds in the future. That is the $200 limit below, only into {stock.name}, while Phantom
              reviews scrip.work; you can take it back any time.
            </p>
          ) : null}
          <p className="sp-save-trust">
            <ShieldCheck size={16} strokeWidth={2} aria-hidden />
            <span>
              Your wallet, never ours. Scrip can move at most $200 of your USDC, only into{" "}
              {stock.name}, and you can stop any time.
            </span>
          </p>
          <p className="sp-go-fine">
            {stock.issuerLine} Starting sets aside about {costText(view, solUsd)}, mostly
            deposits that come back if you stop, and confirms you are not a US person.
            {connected ? (
              <>
                {" "}
                Connected as <span className="mono">
                  {short(connected.account.address)}
                </span>.{" "}
                <button
                  type="button"
                  className="sp-save-textbtn"
                  onClick={() => {
                    rememberWallet(null);
                    setConnected(null);
                    setView(null);
                    setPay(null);
                    setSkipFirst(false);
                  }}
                >
                  Use another wallet
                </button>
              </>
            ) : null}
          </p>
        </>
      )}

      <dialog
        ref={sheetRef}
        className="sp-save-dialog sp-save-sheet"
        aria-label="Choose your wallet"
        onClose={() => setSheet(false)}
        onCancel={() => setSheet(false)}
      >
        <div className="sp-save-dialog-head">
          <p className="sp-save-sheet-title">
            {wallets.length ? "Choose your wallet" : "Open in your wallet app"}
          </p>
          <button
            type="button"
            className="sp-save-icon-btn"
            onClick={() => setSheet(false)}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {sheet ? <WalletList wallets={wallets} onPick={(w) => void go(w)} /> : null}
      </dialog>
    </div>
  );
}

// ── the stock ───────────────────────────────────────────────────────────────────────────

function StockPicker({
  stocks,
  mint,
  onPick,
}: {
  stocks: readonly StartStock[];
  mint: string;
  onPick: (mint: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stock = stocks.find((s) => s.mint === mint) ?? stocks[0]!;
  // Those that can save now first; the rest say they wait for a price.
  const ordered = useMemo(
    () => [...stocks].sort((a, b) => Number(b.ready !== false) - Number(a.ready !== false)),
    [stocks],
  );

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="sp-go-pickbox" ref={box}>
      <button
        type="button"
        className="sp-go-pick"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{stock.name}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className="sp-go-menu" role="listbox" aria-label="Into which stock">
          {ordered.map((s) => (
            <button
              key={s.mint}
              type="button"
              role="option"
              aria-selected={s.mint === mint}
              className={`sp-go-opt${s.mint === mint ? " is-selected" : ""}`}
              onClick={() => {
                onPick(s.mint);
                setOpen(false);
              }}
            >
              <span className="name">{s.name}</span>
              <span className="note">
                {s.ready === false
                  ? `waits for a price (newest ${s.waited} old)`
                  : s.issuerLine.split(".")[0]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── the first payment ───────────────────────────────────────────────────────────────────

function FirstPanel({
  first,
  couldFirst,
  rateBps,
  stock,
  skip,
  unskip,
  skipped,
}: {
  first: FirstPayment | null;
  couldFirst: boolean;
  rateBps: number;
  stock: StartStock;
  skip: () => void;
  unskip: () => void;
  skipped: boolean;
}) {
  const pct = rateBps / 100;
  if (!first) {
    return (
      <div className="sp-go-first is-next">
        <p className="sp-go-first-title">Your first save: your next payment</p>
        <p className="sp-go-first-say">
          When USDC next lands in this wallet, {pct}% of it becomes {stock.name} by itself,
          seconds later. Start, then send any USDC to this wallet to watch it happen.
        </p>
        {skipped && couldFirst ? (
          <button type="button" className="sp-save-textbtn" onClick={unskip}>
            Start with my last payment instead
          </button>
        ) : null}
      </div>
    );
  }
  const slice = Number(first.sliceUsdc) / 1e6;
  const units = stock.perUnitUsd ? slice / stock.perUnitUsd : null;
  return (
    <div className="sp-go-first">
      <p className="sp-go-first-title">
        {first.payment
          ? "Your first save, from your last payment"
          : "Your first save, from the USDC you hold"}
      </p>
      <div className="sp-go-flow">
        <div className="sp-go-cell">
          <span className="v">{dollars(Number(first.basisUsdc) / 1e6)}</span>
          <span className="k">
            {first.payment ? `paid ${dayMonth(first.payment.at)}` : "in your wallet"}
          </span>
        </div>
        <ArrowRight className="sp-go-arrow" size={18} strokeWidth={2} aria-hidden />
        <div className="sp-go-cell">
          <span className="v">{dollars(slice)}</span>
          <span className="k">{pct}%, saved by itself</span>
        </div>
        <ArrowRight className="sp-go-arrow" size={18} strokeWidth={2} aria-hidden />
        <div className="sp-go-cell is-stock">
          <span className="v">{units ? `≈ ${approxUnits(units)}` : stock.ticker}</span>
          <span className="k">{stock.name}</span>
        </div>
      </div>
      {first.capped && first.payment ? (
        <p className="sp-go-first-say">
          That payment was {dollars(Number(first.payment.usdc) / 1e6)}; a first save takes at
          most $50, so the rule counts {dollars(Number(first.basisUsdc) / 1e6)} of it.
        </p>
      ) : null}
      <p className="sp-go-first-say">
        {stock.ready === false
          ? `US stock prices pause at weekends, and Scrip never guesses one: this saves itself when a fresh price returns (the newest is ${stock.waited} old). Until then it stays in your wallet.`
          : "Seconds after you approve, Scrip saves it the way it will save every payment after: by itself, at a price Pyth verifies, onto a receipt you can open."}
      </p>
      <button type="button" className="sp-save-textbtn" onClick={skip}>
        Start with my next payment instead
      </button>
    </div>
  );
}

/** Units at Jupiter's display price, short: an illustration of the slice, never a settlement. */
function approxUnits(n: number): string {
  if (n >= 0.01)
    return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
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
  // Before a wallet is known: the sum for a new wallet, about 0.026 SOL.
  const lamports =
    view && !view.saving ? Number(view.needLamports) - 890_880 - 3_200_000 : 23_400_000;
  const money = solInMoney(lamports, solUsd);
  return `${(lamports / 1e9).toFixed(3)} SOL${money ? ` (${money})` : ""}`;
}

function NeedSol({
  address,
  have,
  need,
  solUsd,
}: {
  address: string;
  have: bigint;
  need: bigint;
  solUsd: number | null;
}) {
  const missing = Number(need - have);
  const money = solInMoney(missing, solUsd);
  return (
    <div className="sp-start-sol" role="status">
      <p className="title">First, a little SOL for the network</p>
      <p>
        Send at least <strong>{(missing / 1e9).toFixed(3)} SOL</strong>
        {money ? ` (${money})` : ""} to this wallet. Solana charges its own network fees in SOL,
        and Scrip does not pay them for you; none of it goes to Scrip. Most of it is a deposit
        that comes back if you stop; the rest prepays the fees of your next automatic saves.
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
        {saving.enabled
          ? `You save ${saving.rateBps / 100}% of every payment`
          : "Saving every payment is stopped"}
      </p>
      <p className="sp-start-done-sub">
        {saving.enabled
          ? `Into ${saving.stock ?? "your stock"}, by itself, as payments land.`
          : "Turn it back on whenever you like."}
      </p>
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

// ── after the approval: watching the first save happen ──────────────────────────────────

type Watch = {
  ruleOn: boolean;
  enabledUnix: number;
  unswept: string;
  sliceNext: string;
  waitingForPrice: boolean;
  first: {
    sig: string;
    basisUsdc: string;
    paidUsdc: string;
    amountRaw: string;
    settledUnix: number;
    seconds: number;
    match: { by: string; usdc: string; amountRaw: string } | null;
  } | null;
  asset: { symbol: string; name: string; decimals: number } | null;
};

function useWatch(
  owner: string,
  on: boolean,
): { watch: Watch | null; elapsed: number; over: boolean } {
  const [watch, setWatch] = useState<Watch | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [t0] = useState(() => Date.now());
  const over = now - t0 > WATCH_MS;
  const printed = Boolean(watch?.first);

  useEffect(() => {
    if (!on || over) return;
    let stop = false;
    let woke = false;
    const look = async () => {
      const r = await fetch(`/api/start/watch/${owner}`, { cache: "no-store" }).catch(
        () => null,
      );
      if (stop || !r?.ok) return;
      const w = (await r.json().catch(() => null)) as Watch | null;
      if (!w) return;
      setWatch(w);
      // Money waiting with no receipt half a minute in: ask Scrip's servers to look again.
      if (!w.first && BigInt(w.sliceNext || "0") > 0n && Date.now() - t0 > 30_000 && !woke) {
        woke = true;
        void fetch("/api/start/wake", { method: "POST" }).catch(() => undefined);
      }
    };
    void look();
    // After the first receipt, a little longer, for a sponsor's match landing seconds behind it.
    const t = setInterval(() => void look(), printed ? POLL_MS * 2 : POLL_MS);
    const stopAfter = printed ? setTimeout(() => clearInterval(t), 60_000) : null;
    return () => {
      stop = true;
      clearInterval(t);
      if (stopAfter) clearTimeout(stopAfter);
    };
  }, [owner, on, over, printed, t0]);

  useEffect(() => {
    if (printed || over) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [printed, over]);

  return { watch, elapsed: Math.max(0, Math.floor((now - t0) / 1000)), over };
}

function Started({
  done,
  compact,
  openPlan,
}: {
  done: Done;
  compact: boolean;
  openPlan: StartCardProps["openPlan"];
}) {
  const { watch, elapsed, over } = useWatch(done.owner, true);
  // Scrip's own Plan, for somebody who did not just join one and is not its sponsor.
  const offer =
    openPlan && done.joined.length === 0 && done.owner !== openPlan.sponsor ? openPlan : null;
  const pct = done.rateBps / 100;
  const name = done.stock.name;
  const f = watch?.first ?? null;
  const decimals = watch?.asset?.decimals ?? done.stock.decimals;
  const waitingSlice = watch ? BigInt(watch.sliceNext || "0") : 0n;
  const expected = done.first ? BigInt(done.first.sliceUsdc) : waitingSlice;

  return (
    <div className={`sp-start sp-start-done${compact ? " is-compact" : ""}`} role="status">
      <p className="sp-start-done-title">
        <Check size={20} strokeWidth={2} aria-hidden />
        You save {pct}% of every payment
      </p>
      <p className="sp-start-done-sub">
        Into {name}, by itself, as payments land.{" "}
        {done.settled
          ? ""
          : "Solana is still confirming it; your savings page shows it the moment it lands."}
      </p>

      {f ? (
        <div className="sp-watch-stub">
          <Stub
            href={`/receipt/${f.sig}`}
            compact
            printing
            kicker="Saved automatically"
            landed={
              <>
                <strong>{dollars(Number(f.basisUsdc) / 1e6)}</strong>{" "}
                {done.first ? "at the start" : "landed"}
              </>
            }
            became={`${pct}% became`}
            units={unitsText(f.amountRaw, decimals)}
            symbol={name}
            when={stampUTC(f.settledUnix)}
            sections={[
              {
                rows: [
                  {
                    k: "Became stock",
                    v: `${f.seconds} s after ${done.first ? "you started" : "it landed"}, by itself`,
                  },
                ],
              },
              ...(f.match
                ? [
                    {
                      rows: [
                        {
                          k: `Added by ${f.match.by}`,
                          v: `${dollars(Number(f.match.usdc) / 1e6)} → ${unitsText(f.match.amountRaw, decimals)} ${name}`,
                          tone: "ok" as const,
                        },
                      ],
                    },
                  ]
                : []),
            ]}
          />
          <p className="sp-start-next">
            <strong>That is what every payment does now.</strong> Nobody has to do anything:
            when USDC lands in this wallet, {pct}% of it becomes {name} like this, with its own
            receipt.
          </p>
        </div>
      ) : (
        <ol className="sp-watch" aria-live="polite">
          <li className="sp-watch-step is-done">
            <span className="dot" aria-hidden />
            <span>
              Saving is on: {pct}% of every payment, into {name}.
            </span>
          </li>
          {done.first || waitingSlice > 0n ? (
            <>
              <li className="sp-watch-step is-done">
                <span className="dot" aria-hidden />
                <span>
                  {done.first
                    ? `${dollars(Number(done.first.basisUsdc) / 1e6)} counted as your first payment.`
                    : `A payment landed: ${dollars(Number(watch?.unswept ?? "0") / 1e6)}.`}
                </span>
              </li>
              <li className={`sp-watch-step ${watch?.waitingForPrice ? "is-wait" : "is-now"}`}>
                {watch?.waitingForPrice ? (
                  <span className="dot" aria-hidden />
                ) : (
                  <Loader2 className="spin" size={16} strokeWidth={2} aria-hidden />
                )}
                <span>
                  {watch?.waitingForPrice
                    ? `${dollars(Number(expected) / 1e6)} waits for a price. US stock prices pause at weekends, and Scrip never guesses one; it saves itself when a fresh price returns, and the money stays in your wallet until then.`
                    : over
                      ? `Saving ${dollars(Number(expected) / 1e6)} into ${name} is taking longer than usual. Your savings page shows it the moment it prints.`
                      : `Saving ${dollars(Number(expected) / 1e6)} into ${name}, by itself… ${elapsed} s`}
                </span>
              </li>
            </>
          ) : (
            <li className="sp-watch-step is-now">
              <Loader2 className="spin" size={16} strokeWidth={2} aria-hidden />
              <span>
                Waiting for your next payment. Send any USDC to this wallet, from anywhere, and
                watch it save itself here.
              </span>
            </li>
          )}
        </ol>
      )}

      {!f && !done.first && waitingSlice === 0n ? (
        <div className="sp-watch-addr">
          <QrClient text={`solana:${done.owner}`} size={104} label="This wallet's address" />
          <div>
            <p className="mono">{done.owner}</p>
            <CopyText text={done.owner} label="Copy the address" />
          </div>
        </div>
      ) : null}

      {done.joined.map((j) => (
        <p key={j.plan} className="sp-start-match">
          <strong>{j.sponsorName ?? "Your sponsor"}</strong> adds {j.matchBps / 100}% of every
          automatic save, up to {dollars(Number(j.monthlyCapUsdc) / 1e6)} a month. You joined
          their Plan.
        </p>
      ))}
      {offer ? <RequestToJoin plan={offer} compact /> : null}
      {done.joined.length === 0 && !offer && f ? (
        <p className="sp-start-next">
          Whoever pays you can add to every automatic save, in stock, with a Plan the program
          enforces. Ask them: the message carries a link that shows them how.
        </p>
      ) : null}
      <div className="sp-start-done-actions">
        {/* A full load, so the page reads the new session and the new record for certain. */}
        <button
          type="button"
          className="sp-save-go"
          onClick={() => window.location.assign("/app")}
        >
          Open your savings
        </button>
        {done.joined.length === 0 ? (
          <AskForMatch
            from={short(done.owner)}
            className="sp-start-secondary"
            label="Ask whoever pays you to match it"
          />
        ) : null}
      </div>
    </div>
  );
}

function WalletList({
  wallets,
  onPick,
}: {
  wallets: readonly Sendable[];
  onPick: (w: Sendable) => void;
}) {
  if (wallets.length === 0) {
    const here = typeof window === "undefined" ? "https://scrip.work/" : window.location.href;
    return (
      <div className="sp-save-sheet-body">
        {isPhone() ? (
          <>
            <p className="sp-save-sheet-say">
              Open Scrip inside your wallet app, where starting takes one approval.
            </p>
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
            Scrip uses a Solana wallet you already have. Install{" "}
            <a href="https://phantom.app">Phantom</a>,{" "}
            <a href="https://solflare.com">Solflare</a> or{" "}
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
          <button
            key={w.name}
            type="button"
            className="sp-save-wallet"
            onClick={() => onPick(w)}
          >
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
