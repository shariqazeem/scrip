"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, X } from "lucide-react";
import type { PickerStock } from "@/lib/save/catalogue";
import { type Sendable, connect, fromBase64, signAndSend } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";
import { StockSearch } from "./stock-search";
import { type BuiltBody, type QuoteBody, type WalletBody, dayMonth, dollars, solInMoney, unitsText } from "./types";
import { useLocalMoney } from "./use-local-money";
import { isPhone, rememberWallet, rememberedWallet, silentConnect, useWallets, walletBrowseLinks } from "./wallets";

/**
 * SAVE NOW — the front door's one job.
 *
 * A dollar already in the wallet becomes a stock in the same wallet, with one signature and a
 * receipt in seconds. It opens on income when it can: a connected wallet that was paid lately
 * reads "You received $250 on 6 Oct. Save 10%: $25", offered only if the wallet can spend it.
 * Otherwise it is three amounts and six companies, with the S&P 500 and $5 already chosen,
 * and one button that says exactly what it does.
 *
 * Nothing opens the wallet until the sheet has said, in words, what will move, what it costs
 * in cents, the least it can become, and what the issuer can do to the token.
 */

const CHIPS = [5, 10, 25] as const;

type Props = {
  readonly stocks: readonly PickerStock[];
  readonly featured: readonly string[];
  readonly defaultMint: string;
  readonly initialQuote: QuoteBody | null;
  readonly readAt: string;
  readonly cluster: string;
  /** Disclosures by mint, for the sheet: what the issuer is and can do. */
  readonly disclosures: Readonly<Record<string, string>>;
};

type Amount = { readonly usd: number; readonly source: "chip" | "suggested" | "other" };
type Phase = "idle" | "building" | "signing" | "confirming" | "failed";

export function SaveNow({ stocks, featured, defaultMint, initialQuote, readAt, cluster, disclosures }: Props) {
  const router = useRouter();
  const wallets = useWallets();
  const money = useLocalMoney();
  const byMint = useMemo(() => new Map(stocks.map((s) => [s.mint, s] as const)), [stocks]);

  const [mint, setMint] = useState(defaultMint);
  const [amount, setAmount] = useState<Amount>({ usd: 5, source: "chip" });
  const [touched, setTouched] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [quote, setQuote] = useState<QuoteBody | null>(initialQuote);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [account, setAccount] = useState<{ wallet: Sendable; address: string } | null>(null);
  const [pay, setPay] = useState<WalletBody | null>(null);
  const [sheet, setSheet] = useState<null | "wallets" | "confirm">(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const stock = byMint.get(mint) ?? byMint.get(defaultMint)!;
  const chips = featured.map((m) => byMint.get(m)).filter((s): s is PickerStock => !!s);
  if (!chips.some((c) => c.mint === mint) && byMint.has(mint)) chips.push(byMint.get(mint)!);
  const spendable = pay ? BigInt(pay.usdc) : null;
  const suggestion = pay?.suggestion ?? null;
  const usdLabel = dollars(amount.usd);

  useTxToast(phase === "idle" ? "idle" : phase, `Save ${usdLabel}`, { detail: why ?? undefined });

  // A wallet that already trusts this site reconnects without a popup.
  useEffect(() => {
    if (account) return;
    const name = rememberedWallet();
    const w = name ? wallets.find((x) => x.name === name) : undefined;
    if (!w) return;
    let live = true;
    void silentConnect(w).then((address) => {
      if (live && address) setAccount({ wallet: w, address });
    });
    return () => {
      live = false;
    };
  }, [wallets, account]);

  // What this wallet was paid lately, and what it can spend.
  useEffect(() => {
    if (!account) {
      setPay(null);
      return;
    }
    let live = true;
    fetch(`/api/save/wallet/${account.address}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<WalletBody>) : null))
      .then((body) => {
        if (!live || !body) return;
        setPay(body);
        // Open on income: the slice of the latest payment, unless an amount was chosen by hand.
        if (body.suggestion && !touched) setAmount({ usd: Number(body.suggestion.saveUsdc) / 1e6, source: "suggested" });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [account, touched]);

  // The live quote: what this amount becomes in this stock, right now.
  useEffect(() => {
    if (!(amount.usd >= 1)) {
      setQuote(null);
      return;
    }
    if (initialQuote && quote === initialQuote && mint === defaultMint && amount.usd === 5 && !account) return;
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => {
      const owner = account ? `&owner=${account.address}` : "";
      fetch(`/api/save/quote?mint=${mint}&usd=${amount.usd}${owner}`, { cache: "no-store" })
        .then(async (r) => ({ ok: r.ok, body: (await r.json()) as QuoteBody & { error?: string } }))
        .then(({ ok, body }) => {
          if (!live) return;
          if (ok) {
            setQuote(body);
            setQuoteWhy(null);
          } else {
            setQuote(null);
            setQuoteWhy(body.error ?? "The route is unavailable right now.");
          }
        })
        .catch(() => live && setQuoteWhy("Could not reach the quote."))
        .finally(() => live && setQuoting(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, amount.usd, account]);

  // The sheet is a native dialog: focus is trapped, Escape closes it.
  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal();
    else if (!sheet && d.open) d.close();
  }, [sheet]);

  const choose = (usd: number, source: Amount["source"]) => {
    setTouched(source !== "suggested");
    setAmount({ usd, source });
    if (phase === "failed") setPhase("idle");
    setWhy(null);
  };

  const connectWith = useCallback(async (w: Sendable) => {
    setWhy(null);
    const a = await connect(w);
    if (!a.ok) {
      if (a.why) setWhy(a.why);
      return false;
    }
    rememberWallet(w.name);
    setAccount({ wallet: w, address: a.value.address });
    return true;
  }, []);

  const startSave = async () => {
    setWhy(null);
    setPhase("idle");
    if (account) {
      setSheet("confirm");
      return;
    }
    if (wallets.length === 1) {
      if (await connectWith(wallets[0]!)) setSheet("confirm");
      return;
    }
    setSheet("wallets");
  };

  const approve = async () => {
    if (!account) return;
    setWhy(null);
    setPhase("building");
    let built: BuiltBody & { error?: string };
    try {
      const res = await fetch("/api/save/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: account.address, mint, usd: amount.usd }),
      });
      built = (await res.json()) as typeof built;
      if (!res.ok) {
        setPhase("failed");
        setWhy(built.error ?? "The save could not be prepared. Nothing moved.");
        return;
      }
    } catch {
      setPhase("failed");
      setWhy("Could not reach Scrip. Nothing moved.");
      return;
    }
    setPhase("signing");
    const wa = account.wallet.accounts.find((a) => a.address === account.address);
    if (!wa) {
      setPhase("failed");
      setWhy("The wallet no longer offers this account. Connect it again; nothing moved.");
      return;
    }
    const sent = await signAndSend(account.wallet, wa, fromBase64(built.transactionBase64), cluster);
    if (!sent.ok) {
      setPhase(sent.why ? "failed" : "idle");
      setWhy(sent.why || null);
      return;
    }
    setPhase("confirming");
    try {
      navigator.vibrate?.(24);
    } catch {
      // No haptics on this device.
    }
    router.push(`/receipt/${sent.value}?saved=1`);
  };

  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  // A quote counts only for the stock and the amount on screen; a stale one is never shown.
  const wantUsdc = (BigInt(Math.round(amount.usd * 100)) * 10_000n).toString();
  const fresh = quote && quote.quote.mint === mint && quote.quote.inUsdc === wantUsdc ? quote : null;
  const units = fresh ? unitsText(fresh.quote.outRaw, stock.decimals) : null;
  const fits = spendable === null || BigInt(Math.round(amount.usd * 100)) * 10_000n <= spendable;

  return (
    <div className="sp-save" id="save">
      {suggestion ? (
        <button type="button" className={`sp-save-income${amount.source === "suggested" ? " is-selected" : ""}`} onClick={() => choose(Number(suggestion.saveUsdc) / 1e6, "suggested")}>
          <span className="line">
            You received {dollars(Number(suggestion.usdc) / 1e6)} on {dayMonth(suggestion.at)}.
          </span>
          <span className="ask">
            Save {suggestion.rateBps / 100}%: {dollars(Number(suggestion.saveUsdc) / 1e6)}
          </span>
        </button>
      ) : null}

      <fieldset className="sp-save-group">
        <legend>{suggestion ? "Or an amount" : "How much"}</legend>
        <div className="sp-save-chips">
          {CHIPS.map((usd) => {
            const can = spendable === null || BigInt(usd) * 1_000_000n <= spendable;
            return (
              <button key={usd} type="button" className={`sp-save-chip${amount.source === "chip" && amount.usd === usd ? " is-selected" : ""}`} aria-pressed={amount.source === "chip" && amount.usd === usd} disabled={!can} onClick={() => choose(usd, "chip")}>
                ${usd}
              </button>
            );
          })}
          <label className={`sp-save-chip is-other${amount.source === "other" ? " is-selected" : ""}`}>
            <span aria-hidden>$</span>
            <input
              inputMode="decimal"
              placeholder="Other"
              aria-label="Another amount in dollars"
              value={otherText}
              onChange={(e) => {
                const t = e.target.value.replace(/[^0-9.]/g, "").slice(0, 8);
                setOtherText(t);
                const n = Number(t);
                if (Number.isFinite(n) && n >= 1) choose(Math.round(n * 100) / 100, "other");
              }}
            />
          </label>
        </div>
        {pay && spendable !== null ? (
          <p className="sp-save-held">
            This wallet holds {dollars(Number(spendable) / 1e6)} of USDC{spendable < 1_000_000n ? ". Scrip saves from USDC: add some, then come back." : "."}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="sp-save-group">
        <legend>Into</legend>
        <div className="sp-save-chips is-stocks">
          {chips.map((s) => (
            <button key={s.mint} type="button" className={`sp-save-chip${s.mint === mint ? " is-selected" : ""}`} aria-pressed={s.mint === mint} onClick={() => setMint(s.mint)}>
              {s.name}
            </button>
          ))}
          <button type="button" className="sp-save-chip is-search" onClick={() => setSearchOpen(true)}>
            Search
          </button>
        </div>
      </fieldset>

      <p className="sp-save-live" aria-live="polite">
        {quoteWhy ? (
          <span className="why">{quoteWhy}</span>
        ) : units ? (
          <>
            {usdLabel}
            {money ? <span className="local"> · {money.format(amount.usd)}</span> : null} becomes about <strong>{units}</strong> {stock.name}
            <span className="small">
              {" "}
              {stock.ticker} · {stock.issuer}
            </span>
          </>
        ) : (
          <span className="why">{quoting ? "Asking Jupiter for a price…" : " "}</span>
        )}
      </p>

      <button type="button" className="sp-save-go" onClick={() => void startSave()} disabled={busy || !fits || !!quoteWhy || amount.usd < 1}>
        Save {usdLabel}
      </button>
      <p className="sp-save-under">
        {account ? (
          <>
            From <span className="addr">{account.address.slice(0, 4)}…{account.address.slice(-4)}</span>, into the same wallet.{" "}
            <button
              type="button"
              className="sp-save-textbtn"
              onClick={() => {
                rememberWallet(null);
                setAccount(null);
                setTouched(false);
                setAmount({ usd: 5, source: "chip" });
              }}
            >
              Use another wallet
            </button>
          </>
        ) : (
          <>Uses the Solana wallet you already have. The stock lands in it, never with Scrip.</>
        )}
      </p>

      <StockSearch open={searchOpen} stocks={stocks} selected={mint} readAt={readAt} onPick={setMint} onClose={() => setSearchOpen(false)} />

      <dialog
        ref={sheetRef}
        className="sp-save-dialog sp-save-sheet"
        aria-label={sheet === "wallets" ? "Choose a wallet" : `Save ${usdLabel}`}
        onClose={() => !busy && setSheet(null)}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setSheet(null);
        }}
      >
        <div className="sp-save-dialog-head">
          <p className="sp-save-sheet-title">{sheet === "wallets" ? (wallets.length ? "Choose your wallet" : "Open in your wallet app") : `Save ${usdLabel}`}</p>
          <button type="button" className="sp-save-icon-btn" onClick={() => setSheet(null)} aria-label="Close" disabled={busy}>
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {sheet === "wallets" ? (
          <WalletChoice wallets={wallets} why={why} onPick={async (w) => (await connectWith(w)) && setSheet("confirm")} />
        ) : sheet === "confirm" && account ? (
          <div className="sp-save-sheet-body">
            {suggestion && amount.source !== "suggested" ? (
              <button type="button" className="sp-save-income is-compact" onClick={() => choose(Number(suggestion.saveUsdc) / 1e6, "suggested")}>
                <span className="line">
                  You received {dollars(Number(suggestion.usdc) / 1e6)} on {dayMonth(suggestion.at)}.
                </span>
                <span className="ask">
                  Save {suggestion.rateBps / 100}% instead: {dollars(Number(suggestion.saveUsdc) / 1e6)}
                </span>
              </button>
            ) : null}
            <p className="sp-save-sheet-say">
              Saving <strong>{usdLabel}</strong>
              {money ? ` (${money.format(amount.usd)})` : ""} of USDC from this wallet into <strong>{stock.name}</strong>, in this wallet.
            </p>
            <dl className="sp-save-facts">
              <div>
                <dt>You get</dt>
                <dd>{units ? `about ${units} ${stock.name}` : quoteWhy ?? "asking for a price…"}</dd>
              </div>
              {fresh ? (
                <div>
                  <dt>At the least</dt>
                  <dd>
                    {unitsText(fresh.quote.minOutRaw, stock.decimals)}. If the price moves more than {fresh.quote.slippageBps / 100}% before it lands, the save does not happen and
                    only the network fee is spent.
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Network fee</dt>
                <dd>{fresh ? (solInMoney(fresh.cost.feeLamports, fresh.solUsd) ?? "a fraction of a cent, in SOL") : "…"}</dd>
              </div>
              {fresh && fresh.cost.depositLamports > 0 ? (
                <div>
                  <dt>First time</dt>
                  <dd>
                    A deposit of {(fresh.cost.depositLamports / 1e9).toFixed(4)} SOL{solInMoney(fresh.cost.depositLamports, fresh.solUsd) ? ` (${solInMoney(fresh.cost.depositLamports, fresh.solUsd)})` : ""} opens
                    your {stock.name} account in this wallet. It stays yours, and comes back if you ever close the account.
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>What it is</dt>
                <dd className="fine">{disclosures[mint] ?? "Read the issuer's terms before saving."}</dd>
              </div>
            </dl>
            <p className="sp-save-trust">
              <ShieldCheck size={16} strokeWidth={2} aria-hidden />
              Your stock goes to this wallet, and only you can move it. Scrip never holds it. Not for US persons.
            </p>
            {why ? <p className="sp-save-why">{why}</p> : null}
            <button type="button" className="sp-save-go" onClick={() => void approve()} disabled={busy || !fresh || !fits}>
              {phase === "building" ? "Preparing…" : phase === "signing" ? "Approve in your wallet…" : phase === "confirming" ? "Saving on Solana…" : phase === "failed" ? "Try again" : "Approve in wallet"}
            </button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function WalletChoice({ wallets, why, onPick }: { wallets: readonly Sendable[]; why: string | null; onPick: (w: Sendable) => void }) {
  if (wallets.length === 0) {
    const here = typeof window === "undefined" ? "https://scrip.work/" : window.location.href;
    return (
      <div className="sp-save-sheet-body">
        {isPhone() ? (
          <>
            <p className="sp-save-sheet-say">Open Scrip inside your wallet app, where saving works in one tap.</p>
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
      {why ? <p className="sp-save-why">{why}</p> : null}
      <p className="sp-save-fine">Connecting moves nothing. The next screen says exactly what a save will do before your wallet asks you to approve it.</p>
    </div>
  );
}
