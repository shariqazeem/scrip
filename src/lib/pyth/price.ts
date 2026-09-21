import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * PYTH PRICES, READ FROM SOLANA — parsing the receiver's `PriceUpdateV2`, and the rules
 * about when a price may be used.
 *
 * The same offsets as `anchor/programs/scrip/src/pyth.rs`, checked against the SPYX/USD
 * sponsored account on mainnet. Two questions, two answers:
 *
 *   DISPLAY   the reader is owed the last price AND its age.
 *   SETTLE    the program decides, with FEED_MAX_AGE and MAX_CONF_BPS. This copy only lets
 *             a keeper or a screen know in advance.
 */

export type Price = {
  readonly feedId: string;
  /** Pyth's raw fields: the price is `price × 10^expo` dollars. */
  readonly price: bigint;
  readonly conf: bigint;
  readonly expo: number;
  readonly publishedAt: number;
  /** Full or partial guardian verification. The program requires full. */
  readonly verification: "full" | "partial";
};

/** A price older than this may not be shown. Fifty hours covers a weekend plus a margin. */
export const MAX_AGE_DISPLAY_SECONDS = 50 * 3600;

/** Read off mainnet; equals sha256("account:PriceUpdateV2")[..8]. */
export const PRICE_UPDATE_V2_DISCRIMINATOR = [34, 241, 35, 99, 157, 126, 244, 205] as const;

export function parsePriceAccount(data: Uint8Array): Outcome<Price> {
  if (data.length < 101) return held(`price account is ${data.length} bytes, too short to be a Pyth price update`);
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== PRICE_UPDATE_V2_DISCRIMINATOR[i]) return held("account is not a Pyth PriceUpdateV2");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const level = view.getUint8(40);
  const base = level === 1 ? 41 : 42;
  if (data.length < base + 60) return held("price account is truncated");

  let feedId = "";
  for (let i = base; i < base + 32; i += 1) feedId += data[i]!.toString(16).padStart(2, "0");
  const price = view.getBigInt64(base + 32, true);
  const conf = view.getBigUint64(base + 40, true);
  const expo = view.getInt32(base + 48, true);
  const publishedAt = Number(view.getBigInt64(base + 52, true));

  if (price <= 0n) return held("price feed reports a non-positive price");
  if (expo > 0 || expo < -18) return held(`price feed reports an implausible exponent (${expo})`);

  return ok({ feedId, price, conf, expo, publishedAt, verification: level === 1 ? "full" : "partial" });
}

/** Dollars per unit, as a number, for DISPLAY. */
export function priceToUsd(p: Pick<Price, "price" | "expo">): number {
  return Number(p.price) * 10 ** p.expo;
}

/** USD in 6-decimal base units per whole unit, exact, for arithmetic. */
export function priceToUsdcBase(p: Pick<Price, "price" | "expo">): bigint {
  const shift = 6 + p.expo;
  return shift >= 0 ? p.price * 10n ** BigInt(shift) : p.price / 10n ** BigInt(-shift);
}

/** May this price be SHOWN at this instant? */
export function displayable(price: Price, now: number): Outcome<Price> {
  const age = now - price.publishedAt;
  if (age < -60) return held("price feed is stamped in the future");
  if (age > MAX_AGE_DISPLAY_SECONDS) return held(`price is ${describeAge(age)} old — too old to show`);
  return ok(price);
}

/** Would the PROGRAM accept this price to settle a sweep right now? The same three checks. */
export function settleable(price: Price, now: number, feedMaxAge: number, maxConfBps: number): Outcome<Price> {
  if (price.verification !== "full") return held("the price update is not fully verified");
  const age = now - price.publishedAt;
  if (age > feedMaxAge) return held(`the price is ${describeAge(age)} old — the sweep waits`);
  if (price.conf * 10_000n > price.price * BigInt(maxConfBps)) {
    return held(`the price's confidence band is wider than ${maxConfBps / 100}%`);
  }
  return ok(price);
}

export function describeAge(seconds: number): string {
  if (seconds < 45) return "seconds";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}
