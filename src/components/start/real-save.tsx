import Link from "next/link";
import { ArrowDownLeft, Plus, Repeat2, TrendingUp } from "lucide-react";
import { bps, unitsFromRaw, usdc } from "@/lib/format";
import { describeSeconds } from "@/lib/receipt/figures";
import type { FrontReceipt } from "@/lib/save/latest";
import "./real-save.css";

/**
 * A REAL AUTOMATIC SAVE, AS A WALLET SHOWS IT — the front door's picture of the product.
 *
 * Read from a receipt on Solana mainnet (`frontReceipt`): the payment that landed, the slice the
 * rule took, the stock that arrived in the same wallet and how many seconds later, and a
 * sponsor's match when there was one. Each line enters in the order it happened on chain, once;
 * with reduced motion they are simply there. Every figure is the receipt's own, linked to it,
 * and a receipt to the team's own wallet says so.
 */
export function RealSave({ r }: { r: FrontReceipt }) {
  const rate = bps(r.rateBps ?? 0);
  const units = unitsFromRaw(r.amountRaw, r.decimals);
  const lines = [
    {
      icon: <ArrowDownLeft size={18} strokeWidth={2} aria-hidden />,
      what: r.atStart ? "Saving turned on" : "A payment lands",
      sub: r.atStart ? "the last payment, already in the wallet" : "USDC, sent the way it always is",
      amount: `+${usdc(r.basisUsdc ?? 0n)}`,
      tone: "",
    },
    {
      icon: <Repeat2 size={18} strokeWidth={2} aria-hidden />,
      what: `Scrip saves ${rate}`,
      sub: r.seconds !== null ? `by itself, ${describeSeconds(r.seconds)} later` : "by itself",
      amount: `−${usdc(r.paidUsdc)}`,
      tone: "",
    },
    {
      icon: <TrendingUp size={18} strokeWidth={2} aria-hidden />,
      what: r.name,
      sub: "in the same wallet, at a price Pyth verified",
      amount: `+${units}`,
      tone: "is-ok",
    },
    ...(r.match
      ? [
          {
            icon: <Plus size={18} strokeWidth={2} aria-hidden />,
            what: `Added by ${r.match.by}`,
            sub: "a sponsor's Plan, matching the save",
            amount: `+${unitsFromRaw(r.match.amountRaw, r.decimals)}`,
            tone: "is-ok",
          },
        ]
      : []),
  ];
  return (
    <figure className="sp-real" aria-label="A real automatic save on Solana mainnet">
      <div className="sp-real-head">
        <span className="dot" aria-hidden />
        <span>Your wallet, as it happens</span>
        {r.tag ? <span className="tag">Scrip {r.tag}</span> : null}
      </div>
      <ol className="sp-real-lines">
        {lines.map((l, i) => (
          <li key={l.what} className={`sp-real-line ${l.tone}`} style={{ ["--i" as string]: i }}>
            <span className="ic">{l.icon}</span>
            <span className="what">
              <span className="t">{l.what}</span>
              <span className="s">{l.sub}</span>
            </span>
            <span className="amt">{l.amount}</span>
          </li>
        ))}
      </ol>
      <figcaption className="sp-real-foot">
        <span>A real automatic save on Solana mainnet.</span>
        <Link href={`/receipt/${r.sig}`}>Open its receipt</Link>
      </figcaption>
    </figure>
  );
}
