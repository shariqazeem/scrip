import "server-only";

import { PublicKey } from "@solana/web3.js";
import { type Asset, assetByFeedId, offeredAssets } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { receipts } from "@/lib/db/schema";
import { parsePriceAccount, settleable } from "@/lib/pyth/price";
import { fillVsPyth } from "@/lib/receipt/figures";
import { multiplierAt } from "@/lib/receipt/multiplier";
import { FEED_MAX_AGE_SECONDS, MAX_CONF_BPS } from "@/lib/rule/slice";
import { connection } from "@/lib/solana/connection";

/**
 * WHAT PYTH HAS DONE IN SCRIP, read from the receipts — every one carries the price stamp
 * `finish_sweep` checked — and what it would do right now, read from the pinned accounts.
 */
export type FeedUse = { readonly label: string; readonly receipts: number };
export type PythFigures = {
  readonly stamped: number;
  readonly byFeed: readonly FeedUse[];
  /** Seconds between the price's publish time and the settlement, median. */
  readonly medianAgeSeconds: number | null;
  /** The confidence band as a share of the price, median, in basis points. */
  readonly medianBandBps: number | null;
  /** |fill − Pyth| / Pyth over the sweeps that can be priced per unit, median, in bps. */
  readonly medianFillBps: number | null;
  readonly fills: number;
  readonly now: readonly { readonly label: string; readonly ageSeconds: number | null; readonly bandBps: number | null; readonly settles: boolean }[];
  readonly at: number;
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export async function pythFigures(): Promise<PythFigures> {
  const at = Math.floor(Date.now() / 1000);
  const rows = (await db.select().from(receipts)).filter((r) => r.priceFeed && r.price > 0);
  const counts = new Map<string, number>();
  const ages: number[] = [];
  const bands: number[] = [];
  const fills: number[] = [];
  for (const r of rows) {
    const f = assetByFeedId(r.priceFeed);
    const label = f ? (f.basis === "raw" ? f.asset.feedRaw?.label : f.asset.feedAdjusted?.label) ?? "Pyth" : "Pyth";
    counts.set(label, (counts.get(label) ?? 0) + 1);
    ages.push(r.settledUnix - r.pricePublishTime);
    bands.push((r.priceConf / r.price) * 10_000);
    if (r.kind !== "sweep" || !f) continue;
    const asset = assetByMintOf(f.asset, r.asset);
    if (!asset) continue;
    const mult = f.basis === "adjusted" ? await multiplierAt(f.asset, r.settledUnix) : null;
    if (f.basis === "adjusted" && mult === null) continue;
    const fill = fillVsPyth({ paidUsdc: BigInt(r.paidUsdc), amountRaw: BigInt(r.amountRaw), decimals: asset.decimals, price: BigInt(r.price), expo: r.priceExpo, multiplier: mult });
    if (fill) fills.push(Math.abs(fill.deviationBps));
  }

  // Right now: the pinned account of every asset a rule can be set on, and SPYx's token feed.
  const watched: Array<{ label: string; account: string }> = [];
  for (const a of offeredAssets()) {
    for (const feed of [a.feedAdjusted, a.feedRaw]) if (feed?.account) watched.push({ label: feed.label, account: feed.account });
  }
  let now: PythFigures["now"] = [];
  try {
    const infos = await connection().getMultipleAccountsInfo(watched.map((w) => new PublicKey(w.account)), "confirmed");
    now = watched.map((w, i) => {
      const p = infos[i] ? parsePriceAccount(infos[i]!.data) : null;
      if (!p || !p.ok) return { label: w.label, ageSeconds: null, bandBps: null, settles: false };
      return {
        label: w.label,
        ageSeconds: at - p.value.publishedAt,
        bandBps: (Number(p.value.conf) / Number(p.value.price)) * 10_000,
        settles: settleable(p.value, at, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok,
      };
    });
  } catch {
    now = [];
  }

  return {
    stamped: rows.length,
    byFeed: [...counts].map(([label, n]) => ({ label, receipts: n })).sort((a, b) => b.receipts - a.receipts),
    medianAgeSeconds: median(ages),
    medianBandBps: median(bands),
    medianFillBps: median(fills),
    fills: fills.length,
    now,
    at,
  };
}

/** The receipt's own asset, which is the stamped feed's asset for every registered mint. */
function assetByMintOf(stamped: Asset, mint: string): Asset | null {
  return stamped.mint === mint ? stamped : null;
}
