"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, TriangleAlert, Wallet as WalletIcon } from "lucide-react";
import { units as fmtUnits, usd } from "@/lib/format";
import { MAX_REASON_LEN } from "@/lib/intake/memo";
import { type Sendable, connect, fromBase64, signAndSend, solanaWallets } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * THE PAY FORM — amount, reason, a live quote, a wallet button and a Solana Pay QR.
 *
 * States, in order: quoting; route too thin; signing; confirming; settled; failed ("Nothing
 * moved."). The QR carries the same release id the page watches, so a phone that pays lands
 * this screen on the receipt.
 */
type Quote = {
  amountUsdc: string;
  outAmountRaw: string;
  minOutRaw: string;
  priceImpactPct: string;
  route: string[];
  impliedPrice: number;
};

const PRESETS = [5, 20, 50, 200];

export function PayForm({
  owner,
  who,
  asset,
  solanaPayBase,
  cluster,
  prefill,
}: {
  owner: string;
  who: string;
  asset: { symbol: string; name: string; decimals: number; mint: string; issuer: string; singleName: boolean };
  solanaPayBase: string | null;
  cluster: string;
  prefill: { amount: number | null; reason: string };
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<string>(prefill.amount ? String(prefill.amount) : "");
  const [reason, setReason] = useState(prefill.reason);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [wallets, setWallets] = useState<readonly Sendable[]>([]);
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "confirming" | "settled" | "waiting-for-claim" | "failed">("idle");
  const [why, setWhy] = useState<string | null>(null);
  // The same words as the button, where a person can still see them after scrolling away.
  useTxToast(phase === "settled" ? "done" : phase === "waiting-for-claim" ? "confirming" : phase, "Pay in stock", { detail: why ?? undefined });
  const [rid, setRid] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dollars = Number(amount);
  const valid = Number.isFinite(dollars) && dollars >= 1;

  useEffect(() => {
    const registry = solanaWallets;
    const refresh = () => setWallets(registry());
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  // A release id for the QR, minted once per page; the watcher polls on it.
  useEffect(() => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    setRid(Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
  }, []);

  // Quote as the amount settles, debounced.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!valid) {
      setQuote(null);
      setQuoteWhy(null);
      return;
    }
    setQuoting(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pay/quote?owner=${owner}&amount=${dollars}`, { cache: "no-store" });
        const j = (await res.json()) as { quote?: Quote; error?: string; sponsor?: boolean };
        if (!res.ok || !j.quote) {
          if (j.sponsor) {
            // No book: quote the default asset through the tx builder's quote path instead.
            const r2 = await fetch(`/api/pay/quote?owner=${owner}&amount=${dollars}&gift=1`, { cache: "no-store" });
            const j2 = (await r2.json()) as { quote?: Quote; error?: string };
            if (r2.ok && j2.quote) {
              setQuote(j2.quote);
              setQuoteWhy(null);
              return;
            }
            setQuoteWhy(j2.error ?? "The route is unavailable right now.");
          } else setQuoteWhy(j.error ?? "The route is unavailable right now.");
          setQuote(null);
        } else {
          setQuote(j.quote);
          setQuoteWhy(null);
        }
      } catch {
        setQuoteWhy("Could not reach the quote.");
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, owner]);

  // The Solana Pay QR: encodes a transaction request carrying amount, reason and the release id.
  const solanaPayUrl = useMemo(() => {
    if (!solanaPayBase || !valid || !rid) return null;
    const u = new URL(solanaPayBase);
    u.searchParams.set("amount", String(dollars));
    if (reason) u.searchParams.set("reason", reason);
    u.searchParams.set("rid", rid);
    return `solana:${encodeURIComponent(u.toString())}`;
  }, [solanaPayBase, valid, dollars, reason, rid]);

  useEffect(() => {
    if (!solanaPayUrl) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(solanaPayUrl, { margin: 1, width: 336, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [solanaPayUrl]);

  // Watch the release: a phone may pay while this screen is open.
  useEffect(() => {
    if (!rid || phase === "settled") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/pay/watch?rid=${rid}`, { cache: "no-store" });
        const j = (await res.json()) as { state?: string; signature?: string | null };
        if (j.state === "settled" && j.signature) {
          setPhase("settled");
          router.push(`/receipt/${j.signature}`);
        } else if (j.state === "waiting-for-claim" && phase !== "waiting-for-claim") {
          setPhase("waiting-for-claim");
        }
      } catch {
        // A missed poll is not an error worth showing.
      }
    }, 4000);
    return () => clearInterval(t);
  }, [rid, phase, router]);

  async function pay(wallet: Sendable) {
    setWhy(null);
    setPhase("building");
    const account = await connect(wallet);
    if (!account.ok) {
      setPhase("idle");
      if (account.why) setWhy(account.why);
      return;
    }
    let built: { transactionBase64: string; releaseId: string; mode: string; error?: string };
    try {
      const res = await fetch("/api/pay/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payer: account.value.address, owner, dollars, reason, releaseId: rid }),
      });
      built = (await res.json()) as typeof built;
      if (!res.ok) {
        setPhase("failed");
        setWhy(built.error ?? "The payment could not be built. Nothing moved.");
        return;
      }
    } catch {
      setPhase("failed");
      setWhy("Could not reach the server. Nothing moved.");
      return;
    }
    setPhase("signing");
    const sig = await signAndSend(wallet, account.value, fromBase64(built.transactionBase64), cluster);
    if (!sig.ok) {
      setPhase("idle");
      if (sig.why) setWhy(sig.why);
      return;
    }
    setPhase("confirming");
    // The watcher above lands on the receipt once the account exists; give it a direct nudge.
    if (built.mode === "pay") {
      setTimeout(() => router.push(`/receipt/${sig.value}`), 2500);
    } else {
      setPhase("waiting-for-claim");
    }
  }

  const outUnits = quote ? Number(quote.outAmountRaw) / 10 ** asset.decimals : 0;
  const minUnits = quote ? Number(quote.minOutRaw) / 10 ** asset.decimals : 0;
  const impact = quote ? Number(quote.priceImpactPct) * 100 : 0;

  return (
    <div className="sp-pay-grid">
      <form
        className="sp-form"
        onSubmit={(e) => {
          e.preventDefault();
          const w = wallets[0];
          if (w) void pay(w);
        }}
      >
        <div className="sp-field">
          <label className="sp-label" htmlFor="amount">
            Amount, in USDC
          </label>
          <div className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input
              id="amount"
              className="sp-input is-mono"
              inputMode="decimal"
              placeholder="20"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              autoFocus={!prefill.amount}
            />
          </div>
          <div className="sp-choices">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`sp-choice${dollars === p ? " on" : ""}`} onClick={() => setAmount(String(p))}>
                {usd(p)}
              </button>
            ))}
          </div>
          <p className="sp-hint">Minimum $1. Six decimals is the whole precision of the unit.</p>
        </div>

        <div className="sp-field">
          <label className="sp-label" htmlFor="reason">
            For what <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="reason"
            className="sp-input"
            placeholder="shipped the receipt page on Tuesday"
            value={reason}
            maxLength={MAX_REASON_LEN}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="sp-hint">Goes on chain as a memo; its hash goes on the receipt. Anyone who opens the receipt reads it.</p>
        </div>

        <div className="sp-actions">
          {wallets.length === 0 ? (
            <p className="sp-doors-note">
              No Solana wallet is installed in this browser. Scan the QR with a phone wallet, or install Phantom, Solflare or Backpack.
            </p>
          ) : (
            wallets.map((w) => (
              <button
                key={w.name}
                type="button"
                className="sp-action is-primary"
                disabled={!valid || !quote || phase === "building" || phase === "signing" || phase === "confirming"}
                onClick={() => void pay(w)}
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" width={16} height={16} style={{ borderRadius: 4 }} />
                ) : (
                  <WalletIcon size={16} strokeWidth={2} aria-hidden />
                )}
                {phase === "building"
                  ? "Building…"
                  : phase === "signing"
                    ? `Waiting for ${w.name}…`
                    : phase === "confirming"
                      ? "Confirming…"
                      : valid
                        ? `Pay ${usd(dollars)} with ${w.name}`
                        : `Pay with ${w.name}`}
              </button>
            ))
          )}
        </div>
        {why ? (
          <p className="sp-why is-err">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
          </p>
        ) : null}
        {phase === "failed" && !why ? (
          <p className="sp-why is-err">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> The payment failed. Nothing moved.
          </p>
        ) : null}
        {phase === "waiting-for-claim" ? (
          <p className="sp-why is-ok">
            <Check size={14} strokeWidth={2} aria-hidden /> Paid. It waits in escrow until {who} claims it; a receipt is written then.
          </p>
        ) : null}
        <p className="sp-doors-note">
          Your wallet will ask you to approve one transaction: your USDC becomes {asset.symbol} through Jupiter and lands in {who}
          &rsquo;s own account with a receipt. If any step fails, nothing moves.
        </p>
      </form>

      <aside className="sp-quote" aria-live="polite">
        <div className="sp-quote-head">What will land</div>
        {quote ? (
          <div className="sp-quote-units">
            {fmtUnits(outUnits)}
            <span className="sym">{asset.symbol}</span>
          </div>
        ) : (
          <div className="sp-quote-units is-waiting">{quoting ? "Quoting…" : quoteWhy ?? "Enter an amount to see the units."}</div>
        )}
        {quote ? (
          <>
            <div className="sp-quote-row">
              <span className="k">At least</span>
              <span className="v">
                {fmtUnits(minUnits)} {asset.symbol}
              </span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Implied price</span>
              <span className="v">{usd(quote.impliedPrice)} per unit</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Price impact</span>
              <span className="v">{impact.toFixed(2)}%</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Route</span>
              <span className="v">{quote.route.join(" → ") || "Jupiter"}</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Network and permanent receipt</span>
              <span className="v">about 0.004 SOL</span>
            </div>
          </>
        ) : null}
        {qr && solanaPayUrl ? (
          <div className="sp-pay-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`Solana Pay: pay ${who} ${usd(dollars)}`} />
            <p>
              Scan with a phone wallet. The same transaction, signed there. This screen opens the receipt when it settles.
            </p>
          </div>
        ) : null}
        <div className="sp-quote-foot">
          {asset.name}, issued by {asset.issuer}. Dividends are reinvested, not paid; the issuer can freeze and move these tokens.
          {asset.singleName ? " A single name: after-hours liquidity is thin, and the quote shows it." : ""} Slippage 0.5%; a route moving the
          price more than 1% is refused.
        </div>
      </aside>
    </div>
  );
}
