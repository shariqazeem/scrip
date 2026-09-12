"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { short } from "@/lib/format";

/**
 * A REQUEST IS A URL.
 *
 * It encodes the recipient, an optional amount and an optional reason, and opens the payer's
 * own pay form with those fields filled in. There is no invoice record, no pending state, and
 * nothing to reconcile — if the payer never opens it, nothing happened.
 *
 * The QR is generated in the browser from that same URL. Rendering it server-side would put
 * somebody's address in a server log for no benefit; here it never leaves the page.
 */
export function RequestBuilder({ owner, origin }: { owner: string; origin: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    const u = new URL("/app/pay", origin);
    u.searchParams.set("to", owner);
    if (amount.trim()) u.searchParams.set("amount", amount.trim());
    if (reason.trim()) u.searchParams.set("for", reason.trim());
    return u.toString();
  }, [owner, origin, amount, reason]);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      // The QR wears the product's own ink on its own paper rather than stock black-on-white.
      // Contrast is what a scanner needs, and these tokens carry plenty of it.
      color: { dark: "#1a1815ff", light: "#ffffffff" },
      errorCorrectionLevel: "M",
    })
      .then((d) => alive && setQr(d))
      // A QR that cannot be drawn is not worth an error message — the link below it works.
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="wg-form">
      <div className="wg-field">
        <label className="wg-label" htmlFor="req-amount">
          How much, in dollars (optional)
        </label>
        <input
          id="req-amount"
          className="wg-input is-mono"
          inputMode="decimal"
          placeholder="Leave blank to let them choose"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="wg-field">
        <label className="wg-label" htmlFor="req-reason">
          What it is for (optional)
        </label>
        <input
          id="req-reason"
          className="wg-input"
          maxLength={200}
          placeholder="Shipped the receipt page"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="wg-hint">
          Whatever you put here is a suggestion. The payer writes the reason that goes on the
          receipt, in their own words, and they can change it.
        </p>
      </div>

      <div className="wg-request">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wg-request-qr" src={qr} alt={`Payment request for ${short(owner)}`} />
        ) : (
          <div className="wg-request-qr wg-request-qr-blank" aria-hidden />
        )}
        <div className="wg-request-side">
          <p className="wg-hint" style={{ marginTop: 0 }}>
            Anyone who opens this lands on a pay form with your address already in it. They do
            not need an account here.
          </p>
          <code className="wg-request-url mono">{url}</code>
          <button
            type="button"
            className="wg-action"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? (
              <>
                <Check size={15} strokeWidth={2} aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy size={15} strokeWidth={2} aria-hidden /> Copy the link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
