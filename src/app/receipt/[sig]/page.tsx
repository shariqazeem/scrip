import type { Metadata } from "next";
import Link from "next/link";
import { ScripMark } from "@/components/brand/scrip-mark";
import { SettlingReceipt } from "@/components/receipt/settling";
import { CopyLink } from "@/components/receipt/copy-link";
import { type StubSection, Stub } from "@/components/stub/stub";
import { readBookOf } from "@/lib/book/read-book";
import { readReceiptBySignature, NOT_YET_SETTLED } from "@/lib/book/read-receipt";
import { db } from "@/lib/db";
import { receipts as receiptsTable } from "@/lib/db/schema";
import { age, bps, dateUTC, pythToUsd, short, sol, stampUTC, unitsFromRaw, usd, usdc } from "@/lib/format";
import { solUsd } from "@/lib/market";
import { describeDeviation, describeSeconds, fillVsPyth, landedToStock, splitCost } from "@/lib/receipt/figures";
import { multiplierAt } from "@/lib/receipt/multiplier";
import { assetByFeedId } from "@/lib/assets/registry";
import { explorerUrl } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import "../receipt.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sig: string }> };

/**
 * When an arrival landed: from the attribution when the indexer recorded it, otherwise from
 * the arrival's own transaction. Block times never change, so each is read once per process.
 */
const arrivalTimes = new Map<string, number | null>();
async function arrivalTime(a: { sig: string; at?: number | null }): Promise<number | null> {
  if (typeof a.at === "number") return a.at;
  if (arrivalTimes.has(a.sig)) return arrivalTimes.get(a.sig) ?? null;
  const tx = await connection()
    .getTransaction(a.sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
    .catch(() => null);
  const at = tx?.blockTime ?? null;
  if (tx) arrivalTimes.set(a.sig, at);
  return at;
}

/**
 * THE RECEIPT — built from ONE signature and nothing else.
 *
 * No session, no database for anything that is a claim: the account and the transaction
 * are read from the chain at request time. The cache contributes only the attribution of a
 * sweep to senders, and says so on the row. It renders identically from a cold RPC with our
 * servers off, and it will render in ten years if somebody keeps the link.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sig } = await params;
  const r = await readReceiptBySignature(sig);
  if (!r.ok) return { title: "Receipt" };
  const v = r.value;
  const units = v.asset_ ? `${unitsFromRaw(v.amountRaw, v.asset_.decimals)} ${v.asset_.symbol}` : `${v.amountRaw} units`;
  const title = v.kind === "sweep" ? `${usdc(v.basisUsdc)} landed · ${bps(v.rateBps)} became ${units}` : `${usdc(v.paidUsdc)} paid · became ${units}`;
  return {
    title,
    description: `${units} in ${short(v.recipient)}'s own wallet, ${stampUTC(v.settledUnix)}. A permanent receipt on Solana, measured at 7 and 30 days.`,
    openGraph: { title, description: v.reason ? `“${v.reason}”` : "Settled on Solana." },
  };
}

export default async function ReceiptPage({ params }: Params) {
  const { sig } = await params;
  const receipt = await readReceiptBySignature(sig);

  if (!receipt.ok && receipt.why === NOT_YET_SETTLED) {
    return (
      <main className="sp-receipt">
        <div className="sp-receipt-col">
          <Header />
          <SettlingReceipt short={short(sig)} />
          <Foot />
        </div>
      </main>
    );
  }

  if (!receipt.ok) {
    return (
      <main className="sp-receipt">
        <div className="sp-receipt-col">
          <Header />
          <div className="sp-receipt-held">
            <ScripMark size={26} />
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
  const asset = r.asset_;
  const decimals = asset?.decimals ?? 0;
  const symbol = asset?.symbol ?? `${r.asset.slice(0, 4)}…`;
  const units = decimals ? unitsFromRaw(r.amountRaw, decimals) : `${r.amountRaw}`;
  const isSweep = r.kind === "sweep";

  // The recipient's handle, from their Book: one read, and only for the "in @x's wallet" line.
  const book = await readBookOf(connection(), new PublicKey(r.recipient)).catch(() => null);
  const handle = book && book.ok && book.value ? book.value.slug : null;

  // Attribution comes from the cache and is labelled as such on the row.
  const cached = isSweep ? (await db.select({ attributedJson: receiptsTable.attributedJson }).from(receiptsTable).where(eq(receiptsTable.pda, r.address)).limit(1))[0] : undefined;
  const attributed: Array<{ from: string; usdc: string; sig: string; at?: number | null }> = cached ? (JSON.parse(cached.attributedJson) as Array<{ from: string; usdc: string; sig: string; at?: number | null }>) : [];

  // What the receipt DID, in three figures a stranger can check: how fast the stock followed
  // the money, what it paid against the Pyth price it was bound by, and what it cost.
  const seconds = isSweep && attributed.length > 0 ? landedToStock(r.settledUnix, await Promise.all(attributed.map(arrivalTime))) : null;
  const stamped = r.price ? assetByFeedId(r.price.feed) : undefined;
  const inShares = stamped?.basis === "adjusted";
  const multiplier = inShares && stamped ? await multiplierAt(stamped.asset, r.settledUnix) : null;
  const fill =
    r.price && asset && (!inShares || multiplier !== null)
      ? fillVsPyth({ paidUsdc: r.paidUsdc, amountRaw: r.amountRaw, decimals: asset.decimals, price: r.price.price, expo: r.price.expo, multiplier: inShares ? multiplier : null })
      : null;
  const perWhat = inShares ? "a share" : asset?.unit === "troy-ounce" ? "an ounce" : "a token";
  const cost = isSweep || r.kind === "vest" ? splitCost(r.floatSpentLamports, r.rentLamports) : null;
  const solPrice = cost ? await solUsd() : null;

  const sections: StubSection[] = [];
  if (isSweep) {
    sections.push({
      title: "From (attributed from the account’s transfer history)",
      rows:
        attributed.length > 0
          ? attributed.map((a) => ({ k: a.from ? short(a.from) : "unknown sender", v: <a href={explorerUrl("tx", a.sig)}>{usdc(BigInt(a.usdc))}</a> }))
          : [{ k: "not attributed yet", v: "the indexer reads senders after the sweep", tone: "muted" as const }],
    });
    if (seconds !== null) {
      sections.push({ rows: [{ k: "Became stock", v: `${describeSeconds(seconds)} after the money landed` }] });
    }
  } else {
    sections.push({
      rows: [
        { k: "From", v: r.payer ? <a href={explorerUrl("address", r.payer)}>{short(r.payer)}</a> : "—" },
        { k: "Paid", v: usdc(r.paidUsdc) },
        ...(r.reason ? [{ k: "For", v: `“${r.reason}”` }] : []),
        ...(r.reasonMismatch ? [{ k: "Memo", v: "does not match the receipt’s hash", tone: "muted" as const }] : []),
      ],
    });
  }
  if (r.price) {
    const feed = assetByFeedId(r.price.feed);
    sections.push({
      rows: [
        { k: "Price", v: `${usd(pythToUsd(r.price.price, r.price.expo))} · ${feed ? feed.asset.symbol === symbol ? (feed.basis === "raw" ? "Pyth, the token" : "Pyth, the underlying") : "Pyth" : "Pyth"} · ${age(r.settledUnix - r.price.publishTime)} old` },
        { k: "Band", v: `±${usd(pythToUsd(r.price.conf, r.price.expo))}` },
        ...(fill ? [{ k: "Filled at", v: `${usd(fill.perUnitUsd)} ${perWhat} · ${describeDeviation(fill.deviationBps)}` }] : []),
      ],
    });
  }
  if (cost) {
    const parts = [`${sol(cost.rentLamports)} rent, kept with this receipt`, `${sol(cost.tipLamports)} to the keeper`];
    if (cost.accountLamports > 0) parts.push(`${sol(cost.accountLamports)} for a new ${symbol} account`);
    sections.push({
      rows: [
        { k: "Cost", v: `${sol(cost.totalLamports)} from ${r.kind === "vest" ? "the grant’s" : "the register’s"} float${solPrice ? ` · ≈ ${usd((cost.totalLamports / 1e9) * solPrice)} at today’s SOL price` : ""}` },
        { k: "Of which", v: parts.join(" · "), tone: "muted" as const },
      ],
    });
  }
  sections.push({
    title: "Still held",
    rows: [
      {
        k: "7 days",
        v: r.measured7d ? `${unitsFromRaw(r.measured7d.balanceRaw, decimals)} on ${dateUTC(r.measured7d.at)}` : `measured ${dateUTC(r.settledUnix + 7 * 86_400)}`,
        tone: r.measured7d ? "ok" : "muted",
      },
      {
        k: "30 days",
        v: r.measured30d ? `${unitsFromRaw(r.measured30d.balanceRaw, decimals)} on ${dateUTC(r.measured30d.at)}` : `measured ${dateUTC(r.settledUnix + 30 * 86_400)}`,
        tone: r.measured30d ? "ok" : "muted",
      },
    ],
  });
  sections.push({
    rows: [
      { k: "Receipt", v: <a href={explorerUrl("address", r.address)}>{short(r.address)}</a> },
      { k: "Tx", v: <a href={explorerUrl("tx", r.signature)}>{short(r.signature)}</a> },
    ],
  });

  return (
    <main className="sp-receipt">
      <div className="sp-receipt-col">
        <Header />

        <div className="sp-receipt-stub">
          <Stub
            landed={
              isSweep ? (
                <>
                  <strong>{usdc(r.basisUsdc)}</strong> landed
                </>
              ) : (
                <>
                  <strong>{usdc(r.paidUsdc)}</strong> paid
                </>
              )
            }
            became={isSweep ? `${bps(r.rateBps)} became` : r.kind === "gift" ? "A first position, claimed" : r.kind === "grant" ? "Granted, vesting" : r.kind === "vest" ? "Vested" : "It became"}
            units={units}
            symbol={symbol}
            when={stampUTC(r.settledUnix)}
            where="in"
            whereName={handle ? `@${handle}’s wallet` : `${short(r.recipient)}’s wallet`}
            sections={sections}
          />
        </div>

        <div className="sp-receipt-actions">
          <CopyLink />
          <Link href={`/pay/${handle ?? r.recipient}`} className="sp-btn-link">
            Pay {handle ? `@${handle}` : short(r.recipient)} in stock
          </Link>
        </div>

        <div className="sp-receipt-sheet">
          <div className="sp-receipt-sheet-head">
            <span>What arrived</span>
            <span>in the recipient&rsquo;s own wallet</span>
          </div>
          <div className="sp-receipt-asset">
            <div>
              <div className="sp-receipt-asset-name">{asset ? `${asset.name} (${asset.symbol})` : "Unrecognised mint"}</div>
              <div className="sp-receipt-asset-issuer">
                {asset ? (
                  <>
                    {asset.issuer.name} · {asset.issuer.wrapper}
                  </>
                ) : (
                  <span className="mono">{r.asset}</span>
                )}
              </div>
            </div>
            {asset ? (
              <div className="sp-chips">
                {asset.powers.permanentDelegate ? <span className="sp-chip is-caution">issuer permanent delegate</span> : null}
                {asset.powers.pausable ? <span className="sp-chip is-caution">issuer can pause</span> : null}
                {asset.powers.hasMultiplier ? <span className="sp-chip">dividends reinvested via multiplier</span> : null}
                {!asset.powers.permanentDelegate && !asset.powers.freezeAuthority ? <span className="sp-chip">no freeze authority, no delegate</span> : null}
                {asset.kind === "metal" ? <span className="sp-chip is-gold">allocated metal</span> : null}
              </div>
            ) : null}
            {asset ? <p className="sp-receipt-asset-disclosure">{asset.disclosure}</p> : null}
            <div className="sp-receipt-row">
              <span className="k">Raw units, at {decimals} decimals</span>
              <span className="v">{r.amountRaw.toString()}</span>
            </div>
          </div>
        </div>

        <div className="sp-receipt-sheet">
          <div className="sp-receipt-sheet-head">
            <span>Where it is anchored</span>
          </div>
          <div className="sp-receipt-row">
            <span className="k">Recipient</span>
            <span className="v">
              <a href={explorerUrl("address", r.recipient)}>{r.recipient}</a>
            </span>
          </div>
          {r.payer ? (
            <div className="sp-receipt-row">
              <span className="k">Payer</span>
              <span className="v">
                <a href={explorerUrl("address", r.payer)}>{r.payer}</a>
              </span>
            </div>
          ) : (
            <div className="sp-receipt-row">
              <span className="k">Submitted by keeper</span>
              <span className="v">
                <a href={explorerUrl("address", r.submitter)}>{short(r.submitter)}</a>
              </span>
            </div>
          )}
          <div className="sp-receipt-row">
            <span className="k">Receipt account</span>
            <span className="v">
              <a href={explorerUrl("address", r.address)}>{r.address}</a>
            </span>
          </div>
          <div className="sp-receipt-row">
            <span className="k">Transaction</span>
            <span className="v">
              <a href={explorerUrl("tx", r.signature)}>{short(r.signature)}</a>
            </span>
          </div>
          <div className="sp-receipt-row">
            <span className="k">Slot</span>
            <span className="v">{r.settledSlot.toLocaleString("en-US")}</span>
          </div>
          <div className="sp-receipt-row">
            <span className="k">Release id</span>
            <span className="v">{r.releaseId}</span>
          </div>
        </div>

        <Foot />
      </div>
    </main>
  );
}

function Header() {
  return (
    <div className="sp-receipt-top">
      <Link href="/" className="sp-receipt-brand" aria-label="Scrip">
        <ScripMark size={20} />
        Scrip
      </Link>
      <span className="sp-receipt-kicker">Receipt</span>
    </div>
  );
}

function Foot() {
  return (
    <p className="sp-receipt-foot">
      <strong>This page is built from the chain, not from our database.</strong> Every figure above is read from an account anyone
      can open, anchored to a transaction that settled. The 7- and 30-day lines are written by the program from the recipient&rsquo;s
      own token account, by whoever calls for the measurement.
    </p>
  );
}
