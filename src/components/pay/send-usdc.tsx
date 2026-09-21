"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { bps, usd } from "@/lib/format";
import { CopyText } from "@/components/app/copy-text";

/**
 * SEND USDC, THE WAY YOU ALWAYS HAVE. No Scrip transaction at all: a Solana Pay transfer
 * request any phone wallet understands, to the recipient's normal address. The rule on that
 * address takes its slice within seconds. This is what "payers never open Scrip" looks like
 * when a payer happens to be on this page anyway.
 */
const PRESETS = [5, 20, 50, 200];

export function SendUsdc({ owner, who, usdcMint, rateBps, assetSymbol, standIn, minUsd }: { owner: string; who: string; usdcMint: string; rateBps: number | null; assetSymbol: string; standIn: boolean; minUsd: number }) {
  const [amount, setAmount] = useState<string>(String(Math.max(minUsd, 20)));
  const [qr, setQr] = useState<string | null>(null);
  const dollars = Number(amount);
  const valid = Number.isFinite(dollars) && dollars >= 1;
  const url = useMemo(() => {
    if (!valid) return null;
    const label = encodeURIComponent(`Scrip ${who}`);
    const message = encodeURIComponent(rateBps ? `${bps(rateBps)} becomes ${assetSymbol} under ${who}'s rule` : `to ${who}`);
    return `solana:${owner}?amount=${dollars}&spl-token=${usdcMint}&label=${label}&message=${message}`;
  }, [valid, dollars, owner, usdcMint, who, rateBps, assetSymbol]);

  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(url, { margin: 1, width: 336, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const slice = valid && rateBps ? (dollars * rateBps) / 10_000 : null;

  return (
    <div className="sp-pay-grid">
      <div className="sp-form">
        <div className="sp-field">
          <label className="sp-label" htmlFor="usdc-amount">
            Amount, in USDC
          </label>
          <div className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input id="usdc-amount" className="sp-input is-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
          <div className="sp-choices">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`sp-choice${dollars === p ? " on" : ""}`} onClick={() => setAmount(String(p))}>
                {usd(p)}
              </button>
            ))}
          </div>
          <p className="sp-hint">
            {rateBps ? `Under ${who}'s rule, ${bps(rateBps)} of an arrival becomes ${assetSymbol}; arrivals under ${usd(minUsd)} wait for more.` : `${who}'s rule is off right now; this is a plain transfer.`}
          </p>
        </div>
        <div className="sp-field">
          <span className="sp-label">Their address</span>
          <div className="sp-linkline">
            <span className="sp-url">{owner}</span>
            <CopyText text={owner} label="Copy" />
          </div>
          <p className="sp-hint">The address they have always been paid to. Send USDC there from any wallet or exchange; nothing else changes.</p>
        </div>
        {standIn ? <p className="sp-hint">On devnet the pay-in mint is a stand-in for USDC that only the demo script can mint; the QR is real but a wallet will not hold it.</p> : null}
      </div>
      <aside className="sp-quote" aria-live="polite">
        <div className="sp-quote-head">What happens</div>
        {slice !== null ? (
          <div className="sp-quote-units">
            {usd(slice)}
            <span className="sym">becomes {assetSymbol}</span>
          </div>
        ) : (
          <div className="sp-quote-units is-waiting">{valid ? "All of it stays USDC." : "Enter an amount."}</div>
        )}
        {slice !== null ? (
          <>
            <div className="sp-quote-row">
              <span className="k">Stays USDC</span>
              <span className="v">{usd(dollars - slice)}</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Swept</span>
              <span className="v">within seconds, by a keeper</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Receipt</span>
              <span className="v">written in the sweep, on their page</span>
            </div>
          </>
        ) : null}
        {qr && url ? (
          <div className="sp-pay-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`Solana Pay: send ${who} ${valid ? usd(dollars) : ""} USDC`} />
            <p>Scan with a phone wallet. A normal USDC transfer; Scrip is not in the transaction.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
