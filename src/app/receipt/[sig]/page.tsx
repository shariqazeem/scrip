import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { WebgoldMark } from "@/components/brand/webgold-mark";
import { readReceiptBySignature } from "@/lib/book/read-receipt";
import { fromBase, grams, short, stampUTC, usd, usdAligned } from "@/lib/format";
import { explorerUrl } from "@/lib/solana/cluster";
import "../receipt.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sig: string }> };

/**
 * THE NAMED ARRIVAL — the most-shared thing Webgold produces, and the reason the receipt is
 * an on-chain account rather than a database row.
 *
 * This page is built from ONE signature and nothing else: no session, no database, no
 * account. It renders identically from a cold RPC with our servers switched off, and it will
 * render in ten years if somebody keeps the link. That is what "anyone can open it, forever"
 * has to mean if it is going to mean anything.
 *
 * It is deliberately unshelled — see src/components/shell/routes.ts. It is usually opened by
 * somebody who has never heard of Webgold, sent to them to prove one payment happened, and
 * wrapping that in owner chrome offering "Pay" turns an artifact into an advert.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sig } = await params;
  const receipt = await readReceiptBySignature(sig);
  if (!receipt.ok) return { title: "Receipt" };
  const g = Number(receipt.value.gramsE8) / 1e8;
  const what = g > 0 ? grams(g) : usd(fromBase(receipt.value.valueBase, 6));
  return {
    // The share card says what arrived and why, because that is what somebody is sharing.
    title: `${what} received`,
    description: `${what} arrived for ${short(receipt.value.recipient)} — ${receipt.value.reason}`,
    openGraph: { title: `${what} received`, description: receipt.value.reason },
  };
}

export default async function ReceiptPage({ params }: Params) {
  const { sig } = await params;
  const receipt = await readReceiptBySignature(sig);

  if (!receipt.ok) {
    return (
      <main className="wg-receipt">
        <div className="wg-receipt-col">
          <Header />
          <div className="wg-receipt-held">
            <WebgoldMark size={26} />
            <p>
              <strong>There is no receipt at that signature.</strong>
            </p>
            <p className="why">{receipt.why}</p>
            <p className="mono">{short(sig)}</p>
          </div>
          <Foot />
        </div>
      </main>
    );
  }

  const r = receipt.value;
  const gramsNow = Number(r.gramsE8) / 1e8;
  const value = fromBase(r.valueBase, 6);

  return (
    <main className="wg-receipt">
      <div className="wg-receipt-col">
        <Header />

        <section className="wg-receipt-hero">
          <span className="wg-receipt-status">
            <span className="dot" aria-hidden />
            Settled on chain
          </span>
          <p className="wg-receipt-amount">
            {gramsNow > 0 ? (
              <>
                {grams(gramsNow).replace(" g", "")}
                <span className="unit">g of gold</span>
              </>
            ) : (
              usd(value)
            )}
          </p>
          {r.reason ? <p className="wg-receipt-reason">&ldquo;{r.reason}&rdquo;</p> : null}
          <p className="wg-receipt-sub">
            {usd(value)} of value, received {stampUTC(r.at)}
          </p>
        </section>

        <div className="wg-receipt-card">
          <div className="wg-receipt-card-head">
            <span>What arrived</span>
            <span>in the recipient&rsquo;s own wallet</span>
          </div>
          {r.legs.map((leg) => (
            <div key={leg.mint} className="wg-receipt-leg">
              <span className="wg-receipt-leg-name">
                {leg.name}
                <span className="wg-receipt-leg-issuer">
                  {leg.symbol} · {leg.issuer}
                </span>
              </span>
              <span className="mono">{formatQty(leg.amount, leg.decimals)}</span>
              <span className="mono" />
            </div>
          ))}
        </div>

        <div className="wg-receipt-card">
          <div className="wg-receipt-card-head">
            <span>Who, and where it is anchored</span>
            <Check size={14} strokeWidth={2} aria-hidden />
          </div>
          <div className="wg-receipt-row">
            <span className="k">From</span>
            <a className="v" href={explorerUrl("address", r.payer)} target="_blank" rel="noreferrer">
              {short(r.payer)}
            </a>
          </div>
          <div className="wg-receipt-row">
            <span className="k">To</span>
            <a
              className="v"
              href={explorerUrl("address", r.recipient)}
              target="_blank"
              rel="noreferrer"
            >
              {short(r.recipient)}
            </a>
          </div>
          <div className="wg-receipt-row">
            <span className="k">Value at the price stamp</span>
            <span className="v">{usdAligned(value)}</span>
          </div>
          <div className="wg-receipt-row">
            <span className="k">Receipt account</span>
            <a
              className="v"
              href={explorerUrl("address", r.address)}
              target="_blank"
              rel="noreferrer"
            >
              {short(r.address)}
            </a>
          </div>
          <div className="wg-receipt-row">
            <span className="k">Transaction</span>
            <a className="v" href={explorerUrl("tx", r.signature)} target="_blank" rel="noreferrer">
              {short(r.signature)}
            </a>
          </div>
          {r.slot !== null ? (
            <div className="wg-receipt-row">
              <span className="k">Slot</span>
              <span className="v">{r.slot.toLocaleString("en-US")}</span>
            </div>
          ) : null}
          <div className="wg-receipt-row">
            <span className="k">Release</span>
            <span className="v">{r.releaseId.slice(0, 12)}…</span>
          </div>
        </div>

        <Foot />
      </div>
    </main>
  );
}

function Header() {
  return (
    <div className="wg-receipt-top">
      <Link href="/" className="wg-receipt-brand" aria-label="Webgold">
        <WebgoldMark size={20} />
        webgold
      </Link>
      <span className="wg-receipt-kicker">Receipt</span>
    </div>
  );
}

function Foot() {
  return (
    <p className="wg-receipt-foot">
      <strong>This page is built from the chain, not from our database.</strong> Every figure
      above is read from an account anyone can open, anchored to a transaction that settled.
      Webgold recorded what moved and why; it did not judge whether the reason was true.
    </p>
  );
}

/**
 * Token base units → a readable quantity, at the MINT's own decimals.
 *
 * A mint the registry has never heard of has no decimals we can trust, so the raw figure is
 * shown and LABELLED as base units. Printing "160000" unlabelled beside "0.1600" would invite
 * a reader to take it for a hundred and sixty thousand of something — the receipt would be
 * accurate and still mislead, which is the same failure as being wrong.
 */
function formatQty(amount: bigint, decimals: number): string {
  if (decimals === 0) return `${amount.toLocaleString("en-US")} base units`;
  const whole = Number(amount) / 10 ** decimals;
  return whole.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
