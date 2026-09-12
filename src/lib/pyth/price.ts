import { USD_DECIMALS } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * PYTH PRICES, READ FROM SOLANA — parsing and the rules about when a price may be used.
 *
 * WHAT MAINNET ACTUALLY LOOKS LIKE, measured 2026-09-12 and worth writing down because the
 * spec says something else. `CLAUDE.md` describes "Pyth 24/7 equity and metal feeds". The
 * feeds exist, but on Solana they are PUSHED, and how often depends on who is paying to push
 * them. On a Saturday morning:
 *
 *     Crypto.USDC/USD      7 seconds old
 *     Crypto.SPYX/USD    195 seconds old
 *     Equity.US.SPY/USD   22,774 seconds old   (6h — the equity market is shut)
 *     Metal.XAU/USD       33,578 seconds old   (9h)
 *
 * So "hold if stale" cannot be one rule, because a single strict bound makes the book
 * unreadable every weekend and a single loose one lets a swap execute against a nine-hour-old
 * gold price. There are two questions and they deserve two answers:
 *
 *   DISPLAY   the reader is owed the last price AND its age. A gold balance beside "priced
 *             9h ago" is honest and useful; a blank where a number should be is neither.
 *   SETTLE    money is about to move. A price older than a minute is not a price, it is a
 *             memory, and the allocation holds.
 *
 * That distinction is the whole content of this module, and it is a judgement the product
 * makes on purpose rather than a bound somebody picked.
 */

export type Price = {
  readonly feedId: string;
  /** USD in 6-decimal base units, for ONE whole token or unit — see the asset's `basis`. */
  readonly base: bigint;
  /** Pyth's own confidence interval, same units. A wide band is a price under stress. */
  readonly confBase: bigint;
  /** Unix seconds at which the publishers agreed this price. */
  readonly publishedAt: number;
};

export type PriceUse = "display" | "settle";

/** A price older than this may not move money. One minute, because money is moving. */
export const MAX_AGE_SETTLE_SECONDS = 60;

/**
 * A price older than this may not even be shown. Fifty hours covers a weekend plus a margin,
 * so a Saturday book still reads; past that the feed is not merely shut, it is abandoned, and
 * showing a number from it would be showing a number nobody stands behind.
 */
export const MAX_AGE_DISPLAY_SECONDS = 50 * 3600;

/**
 * The widest confidence band a price may carry, as a fraction of the price itself, before it
 * is refused for settlement. 2% is far outside normal for any asset here and is what a feed
 * under stress or mid-halt looks like.
 */
export const MAX_CONF_BPS_SETTLE = 200;

/**
 * The Pyth receiver's `PriceUpdateV2` account layout. Offsets rather than a decoder, because
 * the layout is fixed, this is eight reads, and a dependency in the path of every balance is
 * a dependency that can break every balance.
 *
 *   0   8   anchor discriminator
 *   8   32  write_authority
 *   40  1   verification level: 0 = Partial (one more byte), 1 = Full
 *   41  32  feed_id
 *   73  8   price (i64)
 *   81  8   conf (u64)
 *   89  4   exponent (i32)
 *   93  8   publish_time (i64)
 *
 * Verified against the SOL/USD sponsored feed account on mainnet: byte 40 read 1 (Full) and
 * bytes 41..73 matched the published SOL/USD feed id exactly.
 */
export const PRICE_ACCOUNT_LEN = 134;

export function parsePriceAccount(data: Uint8Array): Outcome<Price> {
  if (data.length < 101) {
    return held(`price account is ${data.length} bytes, too short to be a Pyth price update`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const verification = view.getUint8(40);
  // A Partial update carries one extra byte before the feed id. Both shapes are read rather
  // than one being assumed, because assuming would silently shift every field by a byte.
  const base = verification === 1 ? 41 : 42;
  if (data.length < base + 60) return held("price account is truncated");

  let feedId = "";
  for (let i = base; i < base + 32; i += 1) {
    feedId += data[i]!.toString(16).padStart(2, "0");
  }
  const price = view.getBigInt64(base + 32, true);
  const conf = view.getBigUint64(base + 40, true);
  const expo = view.getInt32(base + 48, true);
  const publishedAt = Number(view.getBigInt64(base + 52, true));

  if (price <= 0n) return held("price feed reports a non-positive price");
  // Pyth exponents are negative and small. Anything else is a misread, not a price.
  if (expo > 0 || expo < -18) return held(`price feed reports an implausible exponent (${expo})`);

  const shift = USD_DECIMALS + expo;
  const scale = (n: bigint) =>
    shift >= 0 ? n * 10n ** BigInt(shift) : n / 10n ** BigInt(-shift);

  return ok({ feedId, base: scale(price), confBase: scale(conf), publishedAt });
}

/**
 * May this price be used for this purpose, at this instant?
 *
 * `now` is a parameter rather than a clock read, because every staleness bug is a
 * disagreement about what time it is and a function that cannot be asked about an instant
 * cannot be tested for one.
 */
export function usable(price: Price, use: PriceUse, now: number): Outcome<Price> {
  const age = now - price.publishedAt;
  if (age < -60) {
    // More than a minute in the future is a clock we cannot reason from.
    return held("price feed is stamped in the future");
  }

  const maxAge = use === "settle" ? MAX_AGE_SETTLE_SECONDS : MAX_AGE_DISPLAY_SECONDS;
  if (age > maxAge) {
    return held(
      use === "settle"
        ? `price is ${describeAge(age)} old — too old to move money against`
        : `price is ${describeAge(age)} old — too old to show`,
    );
  }

  if (use === "settle") {
    const confBps = (price.confBase * 10_000n) / price.base;
    if (confBps > BigInt(MAX_CONF_BPS_SETTLE)) {
      // A wide band is a feed under stress or an asset mid-halt. Money does not move on it.
      return held(
        `price feed's confidence band is ±${Number(confBps) / 100}% — too wide to settle against`,
      );
    }
  }

  return ok(price);
}

/** "9 hours", "3 minutes", "just now" — for a caption beside a number, not a log line. */
export function describeAge(seconds: number): string {
  if (seconds < 45) return "seconds";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}
