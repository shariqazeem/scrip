import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert, Wallet } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";
import { ConnectWallet } from "@/components/auth/connect";
import { GRAMS_PER_TROY_OUNCE, assetByMint } from "@/lib/assets/registry";
import { loadBook } from "@/lib/book/read-book";
import { bps, fromBase, grams, shares, short, usd, usdAligned } from "@/lib/format";
import { formatDecimal } from "@/lib/money";
import { defaultPolicy } from "@/lib/policy";
import { explorerUrl } from "@/lib/solana/cluster";
import { currentOwner } from "@/lib/session/server";
import { freshnessNote } from "@/lib/valuer";

export const metadata: Metadata = { title: "Your book" };
export const dynamic = "force-dynamic";

/**
 * THE BOOK — grams first, the market next, dollars last.
 *
 * Every number here is read from the chain at request time: token balances from the owner's
 * own accounts, quantities through the issuer multiplier, values from Pyth. Nothing is
 * cached into a claim and nothing is estimated. When a price or a multiplier cannot be read,
 * the number is not shown and the page says which one and why — a held leg is reported,
 * never quietly counted as zero, because "worth nothing" and "we could not see it" are
 * different statements about somebody's savings.
 */
export default async function BookPage() {
  const owner = await currentOwner();
  if (!owner) return <SignedOut />;

  const book = await loadBook(owner);
  if (!book.ok) {
    return (
      <PageFrame eyebrow="Your book" title="Grams and the market — in your own wallet.">
        <div className="wg-held">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          <span>{book.why}</span>
        </div>
      </PageFrame>
    );
  }

  const { policy, positions, value, holds, pda } = book.value;
  const held = positions.filter((p) => p.qtyRaw > 0n);
  const mix = policy ?? defaultPolicy();
  const note = freshnessNote(value);

  return (
    <PageFrame
      eyebrow="Your book"
      title="Grams and the market — in your own wallet."
      sub={
        <>
          Webgold indexes your book; it never holds it. Constituents sit in token accounts you
          own, at{" "}
          <a href={explorerUrl("address", owner)} target="_blank" rel="noreferrer" className="mono">
            {short(owner)}
          </a>
          .
        </>
      }
    >
      <section className="wg-hero-book">
        <p className="wg-hero-label">Fine grams of gold</p>
        <p className="wg-hero-grams">
          {grams(Number(formatDecimal(value.grams)))
            .replace(" g", "")}
          <span className="wg-unit">g</span>
        </p>
        <div className="wg-hero-sub">
          <span>
            Whole book <span className="mono">{usd(fromBase(value.valueBase, 6))}</span>
          </span>
          {note ? <span>{note}</span> : null}
          <span>
            One troy ounce is <span className="mono">{GRAMS_PER_TROY_OUNCE}</span> grams
          </span>
        </div>
      </section>

      <div className="wg-stack">
        {holds.length > 0 ? (
          <div className="wg-held">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden />
            <div>
              <strong>Some of this book could not be read just now.</strong> Nothing has been
              estimated in its place.
              <ul>
                {holds.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Positions</span>
            {note ? <span className="mono">{note}</span> : null}
          </div>
          {held.length === 0 ? (
            <EmptyState
              icon={<Wallet size={22} strokeWidth={1.6} />}
              title="Nothing has arrived yet"
              note="This book holds none of the assets Webgold tracks. Value arrives when somebody pays you into it, sends you a named slice, or sponsors a first position."
            >
              <Link href="/assets" className="wg-action">
                See what a book can hold
              </Link>
            </EmptyState>
          ) : (
            <div className="wg-rows">
              {held.map((p) => {
                const leg = value.legs.find((l) => l.asset.mint === p.asset.mint);
                const qty = fromBase(p.qtyAdjusted, p.asset.decimals);
                return (
                  <div key={p.asset.mint} className="wg-pos">
                    <span className="wg-pos-name">
                      <span className="wg-pos-sym">{p.asset.name}</span>
                      <span className="wg-pos-issuer">
                        {p.asset.symbol} · {p.asset.issuer.name}
                      </span>
                    </span>
                    <span className="wg-pos-qty">
                      {p.asset.unit === "troy-ounce"
                        ? `${qty.toFixed(4)} oz`
                        : p.asset.unit === "dollar"
                          ? usdAligned(qty)
                          : shares(qty)}
                    </span>
                    <span className="wg-pos-val">
                      {leg ? usdAligned(fromBase(leg.valueBase, 6)) : "—"}
                    </span>
                    {p.heldWhy ? <p className="wg-pos-note">{p.heldWhy}</p> : null}
                    {p.pendingMultiplier ? (
                      <p className="wg-pos-note">
                        A corporate action is published and not yet active: the multiplier moves
                        to <span className="mono">{p.pendingMultiplier.value}</span> on{" "}
                        {new Date(p.pendingMultiplier.effectiveAt * 1000).toUTCString()}. Your
                        quantity will change; what it is worth will not.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">{policy ? "Your mix" : "The default mix"}</span>
            <Link href="/app/settings" className="mono">
              {policy ? "change" : "sign it"} →
            </Link>
          </div>
          <div className="wg-panel-body">
            <div className="wg-mix">
              {mix.legs.map((l) => {
                const kind = kindOf(l.mint);
                return (
                  <span
                    key={l.mint}
                    className={`wg-mix-seg is-${kind}`}
                    style={{ width: `${l.bps / 100}%` }}
                  />
                );
              })}
            </div>
            <p className="wg-mix-legend">
              {mix.legs.map((l) => (
                <span key={l.mint}>
                  <span className={`wg-mix-dot is-${kindOf(l.mint)}`} />
                  {symbolOf(l.mint)} {bps(l.bps)}
                </span>
              ))}
            </p>
            {!policy ? (
              <p className="wg-page-sub">
                No policy is signed for this wallet yet, so this is the default rather than
                yours. Inbound value follows a policy you signed and nothing else — until you
                sign one, nothing here is a claim about your book.{" "}
                <span className="mono">{short(pda)}</span> is where it will live.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function SignedOut() {
  return (
    <PageFrame
      eyebrow="Your book"
      title="Grams and the market — in your own wallet."
      sub="Webgold reads a book from the chain. Sign in with the wallet that holds it — the signature proves the wallet is yours and authorises nothing."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Open your book</span>
        </div>
        <div className="wg-panel-body">
          <ConnectWallet />
        </div>
      </div>
    </PageFrame>
  );
}

function kindOf(mint: string): string {
  return assetByMint(mint)?.kind ?? "cash";
}
function symbolOf(mint: string): string {
  return assetByMint(mint)?.symbol ?? short(mint);
}
