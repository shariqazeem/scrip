"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Keypair } from "@solana/web3.js";
import { launchNameProblem } from "@/lib/curve/names";
import { walletBrowseLinks } from "@/components/save/wallets";
import { type Connected, signAndRelay, useCurveWallet } from "./wallet-flow";

export type LaunchStock = { readonly symbol: string; readonly name: string; readonly issuer: string; readonly ready: boolean; readonly toSavers: boolean };

const FIRST_BUYS = [0, 5, 25, 100] as const;

/**
 * LAUNCH A TOKEN ON SCRIP CURVE — the stock it is priced in, a name and a symbol, an optional
 * first buy in USDC, one wallet prompt. The new token's key is made here and signs after the
 * wallet; the server never sees it. What the launcher keeps, what savers get and what it costs
 * are said before the button, in the button's own words.
 */
export function LaunchForm({ stocks, cluster }: { stocks: readonly LaunchStock[]; cluster: string }) {
  const { wallets, connected, choose } = useCurveWallet();
  const ready = stocks.filter((s) => s.ready || s.toSavers);
  const [stock, setStock] = useState<string>(ready[0]?.symbol ?? "QQQx");
  const [kind, setKind] = useState<"public" | "demonstration">("public");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [first, setFirst] = useState<number>(0);
  const [phase, setPhase] = useState<"idle" | "wallet" | "building" | "signing" | "done">("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [pool, setPool] = useState<string | null>(null);
  const picked = stocks.find((s) => s.symbol === stock);
  // A preset this stock does not have is never sent: the kind follows what exists.
  const effectiveKind: "public" | "demonstration" = picked?.ready && picked?.toSavers ? kind : picked?.toSavers ? "demonstration" : "public";
  const sym = symbol.trim().toUpperCase();
  const problem = name || symbol ? launchNameProblem(name, symbol) : null;
  const icon = useMemo(() => `/api/curve/icon?${new URLSearchParams({ s: sym || "?", k: stock })}`, [sym, stock]);

  const go = async (c: Connected | null) => {
    setWhy(null);
    if (launchNameProblem(name, symbol)) return setWhy(launchNameProblem(name, symbol));
    if (!c) return setPhase("wallet");
    setPhase("building");
    const mint = Keypair.generate();
    let res: Response;
    try {
      res = await fetch("/api/curve/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "launch", owner: c.account.address, stock, kind: effectiveKind, name, symbol: sym, mint: mint.publicKey.toBase58(), usd: first }),
      });
    } catch {
      setPhase("idle");
      return setWhy("The network dropped the request. Nothing was sent.");
    }
    const j = (await res.json().catch(() => ({}))) as { transactions?: string[]; pool?: string; error?: string };
    if (!res.ok || !j.transactions || !j.pool) {
      setPhase("idle");
      return setWhy(j.error ?? "The launch could not be built.");
    }
    setPhase("signing");
    const sent = await signAndRelay(c, cluster, j.transactions, mint);
    if (!sent.ok) {
      setPhase("idle");
      return setWhy(sent.why || (sent.signatures.length > 0 ? "The first part landed; the launch itself did not. Your USDC is now in your wallet as stock." : null));
    }
    setPool(j.pool);
    setPhase("done");
  };

  if (phase === "done" && pool) {
    return (
      <div className="sp-cv-form">
        <p className="sp-cv-done">
          {sym} is live, priced in {picked?.name}. {effectiveKind === "public" ? "Every trading fee it pays now goes half to you and half to savers." : "Every trading fee it pays now goes to savers."}
        </p>
        <div className="sp-cv-actions">
          <Link href={`/curve/${pool}`} className="sp-btn is-primary">
            Open {sym}
          </Link>
          <Link href="/curve" className="sp-btn">
            All launches
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-cv-form">
      <div className="sp-cv-step">
        <span className="k">Priced in</span>
        <div className="sp-cv-stocks" role="radiogroup" aria-label="The stock it is priced in">
          {stocks.map((s) => (
            <button key={s.symbol} type="button" role="radio" aria-checked={stock === s.symbol} className={`sp-cv-stock${stock === s.symbol ? " is-on" : ""}`} disabled={!s.ready && !s.toSavers} onClick={() => setStock(s.symbol)}>
              <span className="n">{s.name}</span>
              <span className="d">{s.ready || s.toSavers ? s.issuer : "Not open yet"}</span>
            </button>
          ))}
        </div>
        <p className="sp-cv-note">Every buy pays in {picked?.name ?? "the stock"}, and every trading fee is {picked?.name ?? "the stock"}.</p>
      </div>

      <div className="sp-cv-step">
        <span className="k">Name and symbol</span>
        <div className="sp-cv-pair">
          <input className="sp-cv-input" aria-label="Name" placeholder="Savers' Club" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="sp-cv-input mono" aria-label="Symbol" placeholder="SAVE" maxLength={10} value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
        </div>
        {problem ? <p className="sp-cv-note">{problem}</p> : null}
      </div>

      {picked?.ready && picked?.toSavers ? (
        <div className="sp-cv-step">
          <span className="k">Who keeps the fee</span>
          <div className="sp-cv-stocks" role="radiogroup" aria-label="Who keeps the fee">
            <button type="button" role="radio" aria-checked={kind === "public"} className={`sp-cv-stock${kind === "public" ? " is-on" : ""}`} onClick={() => setKind("public")}>
              <span className="n">Half to you, half to savers</span>
              <span className="d">Graduates at about $850 of {picked.name}</span>
            </button>
            <button type="button" role="radio" aria-checked={kind === "demonstration"} className={`sp-cv-stock${kind === "demonstration" ? " is-on" : ""}`} onClick={() => setKind("demonstration")}>
              <span className="n">All of it to savers</span>
              <span className="d">You keep none; graduates at about $15</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="sp-cv-step">
        <span className="k">First buy, optional</span>
        <div className="sp-cv-amounts">
          {FIRST_BUYS.map((a) => (
            <button key={a} type="button" className={`sp-cv-amount${first === a ? " is-on" : ""}`} onClick={() => setFirst(a)}>
              {a === 0 ? "None" : `$${a}`}
            </button>
          ))}
        </div>
        <p className="sp-cv-note">
          Paid in USDC: Jupiter turns it into {picked?.name ?? "the stock"}, then it buys your token in the same approval. The first buy pays the lowest fee, 1%; anyone
          buying in the first hour after pays more, from 25% falling to 1%.
        </p>
      </div>

      <div className="sp-cv-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={64} height={64} />
        <span className="t">
          <b>{sym || "SYMBOL"}</b>
          <span>
            {name.trim() || "Your token"}, priced in {picked?.name}
          </span>
        </span>
      </div>

      <p className="sp-cv-note">
        Of every trading fee, Meteora keeps a fifth.{" "}
        {effectiveKind === "public"
          ? `Of the rest, half is yours and half goes to savers, into a Scrip Plan in ${picked?.name} that adds it to people's automatic saves. At about $850 of ${picked?.name} the curve graduates to a Meteora pool, every position locked for good.`
          : `All of the rest goes to savers, into a Scrip Plan in ${picked?.name} that adds it to people's automatic saves; you keep none. At about $15 of ${picked?.name} the curve graduates to a Meteora pool, every position locked for good.`}{" "}
        The new accounts cost about 0.03 SOL, from your wallet.
      </p>

      {phase === "wallet" && !connected ? (
        <div className="sp-cv-step">
          <span className="k">Choose your wallet</span>
          {wallets.length > 0 ? (
            <div className="sp-cv-wallets">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  className="sp-btn"
                  onClick={async () => {
                    const c = await choose(w);
                    if (typeof c === "string") return setWhy(c || null);
                    void go(c);
                  }}
                >
                  {w.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="sp-cv-wallets">
              {walletBrowseLinks(typeof window === "undefined" ? "https://scrip.work/curve/launch" : window.location.href).map((l) => (
                <a key={l.name} className="sp-btn" href={l.href}>
                  Open in {l.name}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {why ? <p className="sp-cv-err">{why}</p> : null}

      <div className="sp-cv-actions">
        <button type="button" className="sp-btn is-primary" disabled={phase === "building" || phase === "signing" || Boolean(problem) || !name || !symbol} onClick={() => go(connected)}>
          {phase === "building" ? "Preparing…" : phase === "signing" ? "Waiting for your wallet…" : `Launch ${sym || "your token"}`}
        </button>
      </div>
      <p className="sp-cv-note">
        {connected ? `Signing as ${connected.account.address.slice(0, 4)}…${connected.account.address.slice(-4)}. ` : ""}Your wallet asks once. A launch is a speculative token,
        not a stock and not a share of one; Scrip makes no claim about its price, only about where its fees go. Not offered to US persons.
      </p>
    </div>
  );
}
