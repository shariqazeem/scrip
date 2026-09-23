"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScripMark } from "@/components/brand/scrip-mark";

/**
 * A RECEIPT THAT IS STILL SETTLING. The server found no transaction at this signature, which
 * almost always means it is seconds old — every money action in the product opens its
 * receipt the moment it is sent. So this asks the server again every few seconds, and the
 * real receipt replaces it the instant it can be read. Only after a minute with nothing does
 * it say what the page used to say straight away: there is no receipt at that signature.
 *
 * A minute is the honest bound: a transaction's blockhash is accepted for about 150 blocks,
 * roughly a minute, and after that it can never land.
 */
const EVERY_MS = 2_500;
const TRIES = 24;

export function SettlingReceipt({ short }: { short: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const gaveUp = tries >= TRIES;

  useEffect(() => {
    if (gaveUp) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, EVERY_MS);
    return () => clearTimeout(t);
  }, [tries, gaveUp, router]);

  return (
    <div className="sp-receipt-held" aria-live="polite">
      <ScripMark size={26} />
      {gaveUp ? (
        <>
          <p>
            <strong>There is no receipt at that signature.</strong>
          </p>
          <p className="why">
            Nothing with that signature has settled on this cluster in the last minute. If it was just sent, it was not accepted — and
            nothing moved.
          </p>
        </>
      ) : (
        <>
          <p className="sp-receipt-settling">
            <span className="dot" aria-hidden />
            <strong>Settling on Solana.</strong>
          </p>
          <p className="why">
            The receipt is written in the same transaction as the stock, and appears here within seconds. This page is checking the chain
            for it now.
          </p>
        </>
      )}
      <p className="mono">{short}</p>
    </div>
  );
}
