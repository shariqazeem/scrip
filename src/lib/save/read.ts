import "server-only";

import { eq } from "drizzle-orm";
import type { Asset } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { saves } from "@/lib/db/schema";
import { type Outcome, held, ok } from "@/lib/outcome";
import { readPrice } from "@/lib/pyth/read";
import { type Fill, fillVsPyth } from "@/lib/receipt/figures";
import { multiplierAt } from "@/lib/receipt/multiplier";
import { connection } from "@/lib/solana/connection";
import { type TxView, readTxView } from "@/lib/solana/tx-view";
import { type SaveStock, pricedAsset, stockByMint } from "./catalogue";
import { type Hop, type ParsedSave, parseSave } from "./parse";

/**
 * A SAVE'S RECEIPT — from one signature, like every receipt Scrip prints.
 *
 * The transaction is the record: who saved, what they paid, what they got, through which
 * pools. The one figure it cannot carry is Pyth's price at that moment, because a price
 * account is overwritten every few seconds. So the first time a save is read (by its own
 * receipt page, a moment after it lands, or by the indexer), Pyth's account is read too,
 * and the stamp is kept beside the row only if it was published within two minutes of the
 * save. A save first read later than that shows no fill rather than a fill against a price
 * from another time.
 */

/** How close Pyth's publish time must be to the save for the fill to be shown. */
export const STAMP_WINDOW_SECONDS = 120;

export type Stamp = { readonly feed: string; readonly label: string; readonly price: bigint; readonly conf: bigint; readonly expo: number; readonly publishTime: number; readonly basis: "raw" | "adjusted" };

export type SaveView = ParsedSave & {
  readonly stock: SaveStock | null;
  readonly stamp: Stamp | null;
  readonly fill: Fill | null;
  /** "a share", "an ounce", "a token": what the fill's price is per. */
  readonly per: string;
};

/** Is this signature a save? Reads the transaction once and answers with it either way. */
export async function readSaveTx(sig: string): Promise<Outcome<{ tx: TxView; save: ParsedSave | null } | null>> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return held("That is not a transaction signature.");
  try {
    const tx = await readTxView(connection(), sig);
    if (!tx) return ok(null);
    return ok({ tx, save: parseSave(tx) });
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** Pyth's price for a priced stock, if it was published within the window of `atUnix`. */
async function stampNear(asset: Asset, atUnix: number): Promise<Stamp | null> {
  // The share feed first: it is the one kept fresh to the second on weekdays.
  for (const [feed, basis] of [
    [asset.feedAdjusted, "adjusted"],
    [asset.feedRaw, "raw"],
  ] as const) {
    if (!feed?.account) continue;
    const p = await readPrice(connection(), feed).catch(() => null);
    if (!p || !p.ok) continue;
    if (Math.abs(p.value.publishedAt - atUnix) > STAMP_WINDOW_SECONDS) continue;
    return { feed: feed.feedId, label: feed.label, price: p.value.price, conf: p.value.conf, expo: p.value.expo, publishTime: p.value.publishedAt, basis };
  }
  return null;
}

/** The stored row's stamp, or a fresh one read now and stored with the save. */
async function stampFor(save: ParsedSave, asset: Asset | undefined): Promise<Stamp | null> {
  const row = (await db.select().from(saves).where(eq(saves.sig, save.sig)).limit(1))[0];
  if (row && row.priceFeed) {
    const basis = asset?.feedAdjusted?.feedId === row.priceFeed ? "adjusted" : "raw";
    const label = (basis === "adjusted" ? asset?.feedAdjusted?.label : asset?.feedRaw?.label) ?? "Pyth";
    return { feed: row.priceFeed, label, price: BigInt(row.price), conf: BigInt(row.priceConf), expo: row.priceExpo, publishTime: row.pricePublishTime, basis };
  }
  const stamp = row || !asset ? null : await stampNear(asset, save.blockTime);
  await recordSave(save, stamp);
  return stamp;
}

/** Keep the save in the cache, with its stamp if one was read. Idempotent by signature. */
export async function recordSave(save: ParsedSave, stamp: Stamp | null): Promise<void> {
  const route = save.hops.map((h) => ({ amm: h.amm, inMint: h.inMint, inAmount: h.inAmount.toString(), outMint: h.outMint, outAmount: h.outAmount.toString() }));
  await db
    .insert(saves)
    .values({
      sig: save.sig,
      owner: save.owner,
      mint: save.mint,
      paidUsdc: Number(save.paidUsdc),
      amountRaw: Number(save.amountRaw),
      settledSlot: save.slot,
      settledUnix: save.blockTime,
      routeJson: JSON.stringify(route),
      feeLamports: save.feeLamports,
      priceFeed: stamp?.feed ?? "",
      price: stamp ? Number(stamp.price) : 0,
      priceExpo: stamp?.expo ?? 0,
      priceConf: stamp ? Number(stamp.conf) : 0,
      pricePublishTime: stamp?.publishTime ?? 0,
    })
    .onConflictDoNothing()
    .catch(() => undefined);
}

/** Everything the receipt shows for a save, from its parsed transaction. */
export async function viewSave(save: ParsedSave): Promise<SaveView> {
  const stock = stockByMint(save.mint) ?? null;
  const asset = stock ? pricedAsset(stock) : undefined;
  const stamp = await stampFor(save, asset);
  const multiplier = stamp?.basis === "adjusted" && asset ? await multiplierAt(asset, save.blockTime) : null;
  const fill =
    stamp && (stamp.basis === "raw" || multiplier !== null)
      ? fillVsPyth({ paidUsdc: save.paidUsdc, amountRaw: save.amountRaw, decimals: save.decimals, price: stamp.price, expo: stamp.expo, multiplier: stamp.basis === "adjusted" ? multiplier : null })
      : null;
  const per = stamp?.basis === "adjusted" ? "a share" : asset?.unit === "troy-ounce" ? "an ounce" : "a token";
  return { ...save, stock, stamp, fill, per };
}

const LABELS_URL = () => `${process.env.JUPITER_API_URL?.replace(/\/+$/, "") || "https://lite-api.jup.ag"}/swap/v1/program-id-to-label`;
let labels: { at: number; value: Promise<Record<string, string>> } | null = null;

/** Jupiter's names for pool programs, so a hop reads "Whirlpool" rather than an address. Held a day. */
export function poolLabels(): Promise<Record<string, string>> {
  if (labels && Date.now() - labels.at < 86_400_000) return labels.value;
  const value = fetch(LABELS_URL(), { cache: "no-store", signal: AbortSignal.timeout(5_000) })
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({}));
  labels = { at: Date.now(), value };
  return value;
}

export function hopLabel(h: Hop, names: Record<string, string>): string {
  return names[h.amm] ?? `${h.amm.slice(0, 4)}…${h.amm.slice(-4)}`;
}
