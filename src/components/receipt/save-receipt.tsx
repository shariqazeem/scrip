import Link from "next/link";
import { type StubSection, Stub } from "@/components/stub/stub";
import { short, sol, stampUTC, unitsFromRaw, usd, usdc } from "@/lib/format";
import { defaultAsset } from "@/lib/assets/registry";
import { ISSUERS, disclosure, pricedAsset } from "@/lib/save/catalogue";
import { nameOf } from "@/lib/save/names";
import { SAVE_MARK, SAVE_MEMO } from "@/lib/save/mark";
import { type SaveView, hopLabel } from "@/lib/save/read";
import { describeDeviation } from "@/lib/receipt/figures";
import { explorerUrl } from "@/lib/solana/cluster";
import { isTeam } from "@/lib/team";
import { LocalAmount } from "@/components/save/local-amount";
import { LocalTime } from "./local-time";
import { AskForMatch, ShareReceipt } from "./share";

/**
 * THE RECEIPT OF A SAVE — the peak of the product, built from the transaction alone.
 *
 * Paid, became, when (in the reader's own time zone), and a share button. Then the two asks
 * that only Scrip has, and only after the receipt: do this with every payment, and ask
 * whoever pays you to match it. Everything a checker wants is in the Proof drawer: the
 * transaction, the memo, the mark, the route hop by hop, the fill against Pyth where the chain
 * prices the stock, and what the network took.
 */
export function SaveReceipt({
  view,
  names,
  fresh,
  waiting,
  saving = null,
}: {
  view: SaveView;
  names: Record<string, string>;
  fresh: boolean;
  waiting: string | null;
  /** The saver already saves every payment (often turned on in this very transaction): no ask, a fact. */
  saving?: { rateBps: number; stockName: string } | null;
}) {
  const stock = view.stock;
  const name = stock?.name ?? `${view.mint.slice(0, 4)}…`;
  const units = unitsFromRaw(view.amountRaw, view.decimals);
  const perUnit = view.amountRaw > 0n ? Number(view.paidUsdc) / 1e6 / (Number(view.amountRaw) / 10 ** view.decimals) : 0;
  const auto = stock ? !!pricedAsset(stock) : false;
  const ruleHref = `/app/rule${auto ? `?asset=${view.mint}` : ""}`;

  const sections: StubSection[] = [
    {
      rows: [
        {
          k: "Paid",
          v: (
            <>
              {usdc(view.paidUsdc)} USDC
              <LocalAmount usd={Number(view.paidUsdc) / 1e6} />
            </>
          ),
        },
        { k: "Became", v: `${units} ${name}` },
        { k: "Per token", v: `${usd(perUnit)}, filled` },
        { k: "Into", v: isTeam(view.owner) ? `${short(view.owner)} · Scrip's own wallet` : `${short(view.owner)}'s own wallet` },
      ],
    },
  ];

  return (
    <>
      <div className="sp-receipt-stub">
        <Stub
          printing={fresh}
          kicker="Saved on Solana"
          tag={isTeam(view.owner) ? "team" : undefined}
          landed={
            <>
              <strong>{usdc(view.paidUsdc)}</strong> saved
            </>
          }
          became="It became"
          units={units}
          symbol={name}
          when={stampUTC(view.blockTime)}
          sections={sections}
        />
      </div>

      <p className="sp-receipt-when">
        Saved <LocalTime unix={view.blockTime} utc={stampUTC(view.blockTime)} />, in one transaction the saver signed.
      </p>

      <div className="sp-receipt-actions">
        <ShareReceipt title={`${usdc(view.paidUsdc)} saved into ${name}`} text={`${usdc(view.paidUsdc)} became ${units} ${name}, in my own wallet. Saved with Scrip on Solana.`} />
        <Link href="/app/save" className="sp-btn-link">
          Save again
        </Link>
      </div>

      <section className={`sp-receipt-asks${fresh ? " is-fresh" : ""}`} aria-label="What next">
        {saving ? (
          <Link href="/app" className="sp-receipt-ask is-primary">
            <span className="t">Every payment saves {saving.rateBps / 100}% by itself</span>
            <span className="p">
              Into {saving.stockName}: whatever USDC lands in this wallet next saves its slice, with a receipt like this one.
              {waiting ? ` Right now automatic saves are waiting for a price Scrip can verify on Solana (the newest is ${waiting} old); payments stay as USDC until one returns.` : ""}{" "}
              Open your savings.
            </span>
          </Link>
        ) : (
          <Link href={ruleHref} className="sp-receipt-ask is-primary">
            <span className="t">Do this with every payment: 10%</span>
            <span className="p">
              {auto
                ? `Every USDC payment into this wallet saves 10% into ${name}. Scrip can move at most $200 in total, and you can stop any time.`
                : `Every USDC payment into this wallet saves 10% into the ${nameOf(defaultAsset().symbol)}. ${name} itself cannot be saved automatically: that needs a price Scrip can verify on Solana.`}
              {waiting
                ? ` Right now automatic saves are waiting: the newest price Pyth published on Solana is ${waiting} old, so payments stay as USDC until one returns.`
                : ""}
            </span>
          </Link>
        )}
        <div className="sp-receipt-ask">
          <AskForMatch from={short(view.owner)} className="sp-receipt-ask-btn" />
          <span className="p">A message for whoever pays you in USDC, with a link that shows them how to add to what you save.</span>
        </div>
      </section>

      <details className="sp-receipt-proof">
        <summary>Proof</summary>
        <div className="sp-receipt-row">
          <span className="k">Transaction</span>
          <span className="v">
            <a href={explorerUrl("tx", view.sig)}>{short(view.sig)}</a>
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Saver</span>
          <span className="v">
            <a href={explorerUrl("address", view.owner)}>{view.owner}</a>
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Memo</span>
          <span className="v mono">{SAVE_MEMO}</span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Save mark</span>
          <span className="v">
            {view.marked ? (
              <>
                carried, so this save is listed under <a href={explorerUrl("address", SAVE_MARK.toBase58())}>{short(SAVE_MARK.toBase58())}</a> with every other
              </>
            ) : (
              "not carried: a save built outside Scrip"
            )}
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Route</span>
          <span className="v">
            {view.hops.length > 0 ? `Jupiter, through ${[...new Set(view.hops.map((h) => hopLabel(h, names)))].join(", then ")}` : "Jupiter, in one transaction"}
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Against Pyth</span>
          <span className="v">
            {view.fill && view.stamp
              ? `${usd(view.fill.perUnitUsd)} ${view.per} · ${describeDeviation(view.fill.deviationBps)} (${view.stamp.label}, published ${stampUTC(view.stamp.publishTime)})`
              : auto
                ? "No Pyth price was recorded within two minutes of this save, so no fill is shown. A weekend or a closed market leaves the share feed quiet."
                : "Pyth does not price this token on Solana, so the fill is shown against nothing but the transaction."}
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Network fee</span>
          <span className="v">{sol(view.feeLamports)}</span>
        </div>
        {view.depositLamports > 0 ? (
          <div className="sp-receipt-row">
            <span className="k">Deposit</span>
            <span className="v">{sol(view.depositLamports)} opened the saver&rsquo;s {name} account; it comes back if the account is closed</span>
          </div>
        ) : null}
        <div className="sp-receipt-row">
          <span className="k">Raw units</span>
          <span className="v mono">
            {view.amountRaw.toString()} at {view.decimals} decimals
          </span>
        </div>
        <div className="sp-receipt-row">
          <span className="k">Slot</span>
          <span className="v mono">{view.slot.toLocaleString("en-US")}</span>
        </div>
      </details>

      <div className="sp-receipt-sheet">
        <div className="sp-receipt-sheet-head">
          <span>What it is</span>
          <span>{stock ? `${stock.ticker} · ${stock.issuer.short}` : short(view.mint)}</span>
        </div>
        <div className="sp-receipt-asset">
          <div>
            <div className="sp-receipt-asset-name">{stock ? `${stock.name} (${stock.symbol})` : "A token Scrip's catalogue does not name"}</div>
            <div className="sp-receipt-asset-issuer">
              {stock ? (
                <a href={stock.issuer.url}>{stock.issuer.name}</a>
              ) : (
                <span className="mono">{view.mint}</span>
              )}
            </div>
          </div>
          {stock ? <p className="sp-receipt-asset-disclosure">{disclosure(stock)}</p> : <p className="sp-receipt-asset-disclosure">{ISSUERS.xstocks.who}</p>}
        </div>
      </div>
    </>
  );
}
