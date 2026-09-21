"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TapeRow } from "@/lib/floor";
import { short, since, unitsFromRaw, usdc } from "@/lib/format";
import "./tape.css";

/**
 * THE TAPE — every sweep, payment, gift, grant and vest across the network, as it happens.
 * Server-rendered with the latest rows, then fed by server-sent events: a new receipt in the
 * cache becomes one line at the top, printed. Real timestamps; on mainnet, real money.
 */
const VERB: Record<TapeRow["kind"], string> = { sweep: "landed", pay: "paid", gift: "gifted", grant: "granted", vest: "vested" };

export function Tape({ initial, limit = 30, dark = true }: { initial: readonly TapeRow[]; limit?: number; dark?: boolean }) {
  const [rows, setRows] = useState<readonly TapeRow[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [live, setLive] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    const es = new EventSource("/api/floor/stream");
    es.addEventListener("hello", () => setLive(true));
    es.addEventListener("receipt", (e) => {
      const r = JSON.parse((e as MessageEvent).data) as TapeRow;
      setRows((prev) => (prev.some((p) => p.id === r.id) ? prev : [r, ...prev].slice(0, limit)));
      setFresh((prev) => new Set(prev).add(r.id));
      setTimeout(() => setFresh((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      }), 2_500);
    });
    es.onerror = () => setLive(false);
    return () => {
      clearInterval(clock);
      es.close();
    };
  }, [limit]);

  return (
    <div className={`sp-tape-feed${dark ? " is-dark" : ""}`} aria-live="polite">
      <div className="sp-tape-head">
        <span className={`live${live ? " on" : ""}`}>
          <span className="dot" aria-hidden />
          {live ? "the tape, live" : "the tape"}
        </span>
        <span>{rows.length === 0 ? "nothing has settled yet" : `${rows.length} most recent, newest first`}</span>
      </div>
      {rows.length === 0 ? (
        <p className="sp-tape-empty">The first receipt on this cluster prints here the moment it settles.</p>
      ) : (
        <ol className="sp-tape-rows">
          {rows.map((r) => (
            <li key={r.id} className={`sp-tape-row${fresh.has(r.id) ? " is-printing" : ""}`}>
              <Link href={`/receipt/${r.sig}`} className="sp-tape-link">
                <span className={`kind is-${r.kind}`}>{r.kind}</span>
                <span className="who">{r.handle ? `@${r.handle}` : short(r.who)}</span>
                <span className="what">
                  {r.kind === "vest" ? (
                    <>
                      <strong>
                        {r.decimals !== null ? unitsFromRaw(BigInt(r.amountRaw), r.decimals) : r.amountRaw} {r.symbol}
                      </strong>{" "}
                      vested{r.payerHandle ? ` from @${r.payerHandle}` : ""}
                    </>
                  ) : (
                    <>
                      <strong>{usdc(BigInt(r.usdc))}</strong> {VERB[r.kind]}
                      {r.payerHandle && r.kind !== "sweep" ? ` by @${r.payerHandle}` : ""} →{" "}
                      <strong>
                        {r.decimals !== null ? unitsFromRaw(BigInt(r.amountRaw), r.decimals) : r.amountRaw} {r.symbol}
                      </strong>
                      {r.kind === "grant" ? ", vesting" : ""}
                    </>
                  )}
                  {r.reason ? <span className="why"> · “{r.reason}”</span> : null}
                </span>
                <span className="when">{since(r.settledUnix, now * 1000)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
