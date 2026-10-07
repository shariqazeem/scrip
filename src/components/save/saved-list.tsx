import Link from "next/link";
import { dateUTC, unitsFromRaw, usdc } from "@/lib/format";
import { stockByMint } from "@/lib/save/catalogue";

/**
 * THE SAVES THIS WALLET MADE, newest first: what it paid, what it became, when, each linked to
 * its receipt. Read from the cache of saves, which the receipt page and the indexer fill from
 * the chain; a save that is not cached yet appears the moment either reads it.
 */
export function SavedList({ rows }: { rows: ReadonlyArray<{ sig: string; mint: string; paidUsdc: number; amountRaw: number; settledUnix: number }> }) {
  if (rows.length === 0) {
    return (
      <p className="sp-fact-note">
        Nothing saved by hand yet. <Link href="/#save">Save part of what you were paid</Link>, and its receipt appears here.
      </p>
    );
  }
  return (
    <ul className="sp-saved">
      {rows.map((r) => {
        const s = stockByMint(r.mint);
        return (
          <li key={r.sig}>
            <Link href={`/receipt/${r.sig}`} className="sp-saved-row">
              <span className="what">
                {usdc(BigInt(r.paidUsdc))} became {unitsFromRaw(BigInt(r.amountRaw), s?.decimals ?? 8)} {s?.name ?? "stock"}
              </span>
              <span className="when">{dateUTC(r.settledUnix)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
