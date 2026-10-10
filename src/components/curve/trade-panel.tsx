"use client";

import { useCallback, useEffect, useState } from "react";
import { walletBrowseLinks } from "@/components/save/wallets";
import { type Connected, signAndRelay, useCurveWallet } from "./wallet-flow";

type Live = { tokensRaw: string | null; stockRaw: string | null; feeBps: number; quoteReserveRaw: string; thresholdRaw: string; migrated: boolean };

const BUYS = [5, 25, 100] as const;
const SELLS = [25, 50, 100] as const;

const units = (raw: string | null | undefined, decimals: number, dp: number) => (raw ? (Number(raw) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: dp }) : "0");

/**
 * BUY OR SELL A LAUNCH — buy with USDC (Jupiter turns it into the stock, the stock buys the
 * token, one approval), sell back into the curve for the stock, which stays in the seller's
 * wallet. Balances and the fee are read from the chain after every trade, never assumed.
 */
export function TradePanel({ pool, symbol, stock, stockName, cluster }: { pool: string; symbol: string; stock: string; stockName: string; cluster: string }) {
  const { wallets, connected, choose } = useCurveWallet();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [usd, setUsd] = useState<number>(25);
  const [other, setOther] = useState("");
  const [share, setShare] = useState<number>(100);
  const [live, setLive] = useState<Live | null>(null);
  const [phase, setPhase] = useState<"idle" | "wallet" | "swapping" | "building" | "signing">("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const owner = connected?.account.address ?? null;

  const refresh = useCallback(async () => {
    const q = owner ? `?owner=${owner}` : "";
    const res = await fetch(`/api/curve/state/${pool}${q}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setLive((await res.json()) as Live);
  }, [owner, pool]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const tokens = live?.tokensRaw ? BigInt(live.tokensRaw) : 0n;
  const sellRaw = (tokens * BigInt(share)) / 100n;

  /** POST to the builder: the transactions, a request to swap first, or why not. */
  const ask = async (body: Record<string, unknown>): Promise<{ ok: true; j: Record<string, unknown> } | { ok: false; swapFirst: boolean; why: string }> => {
    try {
      const res = await fetch("/api/curve/tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 409 && j.swapFirst) return { ok: false, swapFirst: true, why: "" };
      if (!res.ok || !Array.isArray(j.transactions)) return { ok: false, swapFirst: false, why: typeof j.error === "string" ? j.error : "It could not be built." };
      return { ok: true, j };
    } catch {
      return { ok: false, swapFirst: false, why: "The network dropped the request. Nothing was sent." };
    }
  };

  /**
   * A buy in USDC that one transaction cannot carry is two approvals: the swap into the stock lands
   * first, then the buy is built for the stock really in the wallet, so each one checks clean in
   * the wallet. Never two dependent transactions under one prompt.
   */
  const go = async (c: Connected | null) => {
    setWhy(null);
    setDone(null);
    if (!c) return setPhase("wallet");
    if (tab === "sell" && sellRaw <= 0n) return setWhy(`This wallet holds no ${symbol}.`);
    setPhase("building");
    let built = await ask(tab === "buy" ? { action: "buy", owner: c.account.address, pool, usd } : { action: "sell", owner: c.account.address, pool, tokens: sellRaw.toString() });
    if (!built.ok && built.swapFirst) {
      setPhase("swapping");
      const swap = await ask({ action: "swap", owner: c.account.address, stock, usd });
      if (!swap.ok) {
        setPhase("idle");
        return setWhy(swap.why);
      }
      const sent = await signAndRelay(c, cluster, swap.j.transactions as string[]);
      if (!sent.ok) {
        setPhase("idle");
        return setWhy(sent.why || null);
      }
      setPhase("building");
      built = await ask({ action: "buy", owner: c.account.address, pool, stockRaw: String(swap.j.minOut) });
      if (!built.ok) {
        setPhase("idle");
        await refresh();
        return setWhy(`${built.why} Your $${usd} is ${stockName} in your wallet now.`);
      }
    }
    if (!built.ok) {
      setPhase("idle");
      return setWhy(built.why);
    }
    setPhase("signing");
    const sent = await signAndRelay(c, cluster, built.j.transactions as string[]);
    setPhase("idle");
    await refresh();
    if (!sent.ok) return setWhy(sent.why || null);
    setDone(tab === "buy" ? `Bought. ${symbol} is in your wallet.` : `Sold. The ${stockName} is in your wallet.`);
  };

  const busy = phase === "swapping" || phase === "building" || phase === "signing";
  return (
    <div className="sp-cv-trade">
      <div className="sp-cv-tabs" role="tablist" aria-label="Buy or sell">
        {(["buy", "sell"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`sp-cv-tab${tab === t ? " is-on" : ""}`} onClick={() => setTab(t)}>
            {t === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {tab === "buy" ? (
        <>
          <div className="sp-cv-amounts">
            {BUYS.map((a) => (
              <button
                key={a}
                type="button"
                className={`sp-cv-amount${usd === a && !other ? " is-on" : ""}`}
                onClick={() => {
                  setUsd(a);
                  setOther("");
                }}
              >
                ${a}
              </button>
            ))}
            <input
              className="sp-cv-input mono"
              style={{ width: 120, height: 40 }}
              aria-label="Another amount, in dollars"
              inputMode="decimal"
              placeholder="$ other"
              value={other}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, "");
                setOther(raw);
                const v = Number(raw);
                if (Number.isFinite(v) && v > 0) setUsd(Math.min(10_000, v));
              }}
            />
          </div>
          <p className="sp-cv-note">
            Paid in USDC. Jupiter turns it into {stockName}, which buys {symbol}{live && !live.migrated ? ` at the fee now, ${(live.feeBps / 100).toFixed(2)}%` : ""}.
          </p>
        </>
      ) : (
        <>
          <div className="sp-cv-amounts">
            {SELLS.map((p) => (
              <button key={p} type="button" className={`sp-cv-amount${share === p ? " is-on" : ""}`} onClick={() => setShare(p)}>
                {p}%
              </button>
            ))}
          </div>
          <p className="sp-cv-note">
            Sells {units(sellRaw.toString(), 6, 2)} {symbol} back into the curve. You receive {stockName}, which stays in your wallet.
          </p>
        </>
      )}

      {owner ? (
        <p className="sp-cv-bal">
          {units(live?.tokensRaw, 6, 2)} {symbol} · {units(live?.stockRaw, 8, 6)} {stockName}
        </p>
      ) : null}

      {phase === "wallet" && !connected ? (
        wallets.length > 0 ? (
          <div className="sp-cv-wallets">
            {wallets.map((w) => (
              <button
                key={w.name}
                type="button"
                className="sp-btn"
                onClick={async () => {
                  const c = await choose(w);
                  if (typeof c === "string") return setWhy(c || null);
                  setPhase("idle");
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="sp-cv-wallets">
            {walletBrowseLinks(typeof window === "undefined" ? "https://scrip.work/curve" : window.location.href).map((l) => (
              <a key={l.name} className="sp-btn" href={l.href}>
                Open in {l.name}
              </a>
            ))}
          </div>
        )
      ) : null}

      {why ? <p className="sp-cv-err">{why}</p> : null}
      {done ? <p className="sp-cv-done">{done}</p> : null}

      <button type="button" className="sp-btn is-primary" disabled={busy} onClick={() => go(connected)}>
        {phase === "swapping" ? `1 of 2: $${usd} into ${stockName}…` : phase === "building" ? "Preparing…" : phase === "signing" ? "Waiting for your wallet…" : !connected ? "Connect a wallet" : tab === "buy" ? `Buy $${usd} of ${symbol}` : `Sell ${share}% of your ${symbol}`}
      </button>
    </div>
  );
}
