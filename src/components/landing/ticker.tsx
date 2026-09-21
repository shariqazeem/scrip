"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/lib/market";
import { usd } from "@/lib/format";

/**
 * THE TAPE — one line of the market on Solana, moving. Every figure is Jupiter's, read live;
 * the session is the clock's. It repeats itself so the loop is seamless, and it stops under a
 * pointer so a figure can be read. Reduced motion: it stands still.
 */
export function Ticker({ initial }: { initial: Market }) {
  const [m, setM] = useState<Market>(initial);
  const [now, setNow] = useState<number>(initial.at);
  useEffect(() => {
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        if (res.ok) setM((await res.json()) as Market);
      } catch {
        // the last reading stands
      }
    }, 20_000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  const items: Array<{ k: string; v: string; tone?: "up" | "down" }> = [];
  for (const r of m.rows) {
    if (r.priceUsd === null) continue;
    items.push({ k: r.symbol, v: usd(r.priceUsd), tone: r.change24hPct === null ? undefined : r.change24hPct >= 0 ? "up" : "down" });
    if (r.change24hPct !== null) items.push({ k: "", v: `${r.change24hPct >= 0 ? "+" : ""}${r.change24hPct.toFixed(2)}% today`, tone: r.change24hPct >= 0 ? "up" : "down" });
    if (r.underlyingUsd !== null) items.push({ k: `${r.underlying} on the exchange`, v: usd(r.underlyingUsd) });
    if (r.holders !== null) items.push({ k: `${r.symbol} wallets`, v: r.holders.toLocaleString("en-US") });
  }
  items.push({ k: m.session.open ? "NYSE" : "NYSE", v: m.session.line.replace("NYSE ", "") });
  items.push({ k: "Solana", v: "never closes" });
  items.push({ k: "UTC", v: clock(now) });

  const line = (key: string) => (
    <span className="sp-tape-line" key={key} aria-hidden={key === "b"}>
      {items.map((it, i) => (
        <span key={i} className={`sp-tape-item${it.tone ? ` is-${it.tone}` : ""}`}>
          {it.k ? <span className="k">{it.k}</span> : null}
          <span className="v">{it.v}</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="sp-tape" role="marquee" aria-label="The market on Solana, live">
      <div className="sp-tape-track">
        {line("a")}
        {line("b")}
      </div>
    </div>
  );
}

function clock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}
