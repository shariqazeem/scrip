import { type Asset, GRAMS_PER_TROY_OUNCE, assetByMint } from "@/lib/assets/registry";
import { type Decimal, formatDecimal, mulBase, parseDecimal, valueOfQty } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type Price, type PriceUse, describeAge, usable } from "@/lib/pyth/price";

/**
 * THE VALUER — what a book is worth, and in what units, and how sure we are.
 *
 * Two rules it never bends:
 *
 *   1. VALUE COMES FROM THE ADJUSTED QUANTITY, unless the feed is quoted per raw token and
 *      says so. Getting this backwards is the corporate-action bug arriving through the
 *      price instead of through the quantity, and it looks exactly as plausible.
 *   2. A LEG THAT CANNOT BE PRICED HOLDS ALONE. A stale gold feed must not blank a book that
 *      also holds SPYx, and it must not be quietly dropped from the total either — the total
 *      says how much of itself it could not see, and the surface says which leg and why.
 *
 * Nothing here reads a clock. `now` comes in, so a staleness rule can be tested at an instant
 * instead of being tested against whenever the suite happened to run.
 */

export type Holding = {
  readonly asset: Asset;
  /** Token base units as the chain holds them. */
  readonly qtyRaw: bigint;
  /** raw × multiplier-in-force. The quantity a screen shows. */
  readonly qtyAdjusted: bigint;
};

export type ValuedLeg = {
  readonly asset: Asset;
  readonly qtyRaw: bigint;
  readonly qtyAdjusted: bigint;
  /** USD value, 6-decimal base units. */
  readonly valueBase: bigint;
  /** The price used, its age at valuation, and where it came from. */
  readonly price: Price;
  readonly ageSeconds: number;
  readonly source: string;
};

export type HeldLeg = {
  readonly asset: Asset;
  readonly qtyRaw: bigint;
  readonly qtyAdjusted: bigint;
  /** Why this leg could not be valued, in a sentence meant to be shown. */
  readonly why: string;
};

export type BookValue = {
  /** Total USD value of the legs that COULD be priced, 6-decimal base units. */
  readonly valueBase: bigint;
  readonly legs: readonly ValuedLeg[];
  /** Legs that held. Never silently dropped: the surface must say what it could not see. */
  readonly heldLegs: readonly HeldLeg[];
  /** Fine grams of gold held. Metal only — a fund that tracks gold is never counted here. */
  readonly grams: Decimal;
  /** The oldest price behind the total, so a caption can say how fresh the number is. */
  readonly oldestPriceAgeSeconds: number | null;
};

/** Value one holding at one price. */
export function valueLeg(
  holding: Holding,
  price: Price,
  use: PriceUse,
  now: number,
): Outcome<ValuedLeg> {
  const check = usable(price, use, now);
  if (!check.ok) return held(`${holding.asset.symbol}: ${check.why}`);

  // THE ONE LINE THAT MATTERS. A feed quoted per raw token already carries the multiplier —
  // multiplying it by the adjusted quantity would apply the multiplier twice.
  const qty = holding.asset.price.basis === "raw" ? holding.qtyRaw : holding.qtyAdjusted;
  const valueBase = valueOfQty(qty, holding.asset.decimals, price.base);

  return ok({
    asset: holding.asset,
    qtyRaw: holding.qtyRaw,
    qtyAdjusted: holding.qtyAdjusted,
    valueBase,
    price,
    ageSeconds: now - price.publishedAt,
    source: holding.asset.price.label,
  });
}

/**
 * Value a whole book. `prices` is keyed by mint; a mint with no entry holds with a reason
 * rather than being treated as worth nothing — those are very different claims, and only one
 * of them is true.
 */
export function valueBook(
  holdings: readonly Holding[],
  prices: ReadonlyMap<string, Outcome<Price>>,
  use: PriceUse,
  now: number,
): BookValue {
  const legs: ValuedLeg[] = [];
  const heldLegs: HeldLeg[] = [];

  for (const holding of holdings) {
    const price = prices.get(holding.asset.mint);
    if (!price) {
      heldLegs.push({
        ...holding,
        why: `${holding.asset.symbol}: no price was fetched for this asset`,
      });
      continue;
    }
    if (!price.ok) {
      heldLegs.push({ ...holding, why: `${holding.asset.symbol}: ${price.why}` });
      continue;
    }
    const valued = valueLeg(holding, price.value, use, now);
    if (!valued.ok) {
      heldLegs.push({ ...holding, why: valued.why });
      continue;
    }
    legs.push(valued.value);
  }

  const valueBase = legs.reduce((sum, l) => sum + l.valueBase, 0n);
  const ages = legs.map((l) => l.ageSeconds);

  return {
    valueBase,
    legs,
    heldLegs,
    grams: gramsOf(legs),
    oldestPriceAgeSeconds: ages.length ? Math.max(...ages) : null,
  };
}

/**
 * Fine grams of gold in a book.
 *
 * METAL ONLY, and that restriction is the product's whole position on honesty. A share of a
 * gold fund is not a gram of gold and does not get counted here, no matter how conveniently
 * it would round out the headline number. `registry.test.ts` holds the other half of this
 * rule by refusing to let a fund declare a metal unit.
 */
export function gramsOf(legs: readonly ValuedLeg[]): Decimal {
  const perOunce = parseDecimal(GRAMS_PER_TROY_OUNCE);
  if (!perOunce.ok) return { units: 0n, scale: 0 };

  let totalGramBase = 0n; // grams in 1e8 fixed point, plenty for any real holding
  const SCALE = 8;

  for (const leg of legs) {
    if (leg.asset.kind !== "metal") continue;
    // Quantity in whole tokens, at 1e8 precision.
    const wholeAt8 = (leg.qtyAdjusted * 10n ** BigInt(SCALE)) / 10n ** BigInt(leg.asset.decimals);
    const perToken = parseDecimal(leg.asset.unitsPerToken);
    if (!perToken.ok) continue;
    const units = mulBase(wholeAt8, perToken.value); // troy ounces, or grams already
    totalGramBase +=
      leg.asset.unit === "troy-ounce" ? mulBase(units, perOunce.value) : units;
  }

  return { units: totalGramBase, scale: SCALE };
}

/** A caption a reader can act on: "priced 9 hours ago". */
export function freshnessNote(value: BookValue): string | null {
  if (value.oldestPriceAgeSeconds === null) return null;
  const age = value.oldestPriceAgeSeconds;
  return age < 45 ? "priced just now" : `priced ${describeAge(age)} ago`;
}

/** For a caller that has a mint string rather than an Asset. Holds on an unknown mint. */
export function holdingFromMint(
  mint: string,
  qtyRaw: bigint,
  qtyAdjusted: bigint,
): Outcome<Holding> {
  const asset = assetByMint(mint);
  if (!asset) return held(`${mint.slice(0, 8)}… is not an asset Webgold knows how to value`);
  return ok({ asset, qtyRaw, qtyAdjusted });
}

/** Grams as a display string, at the precision `format.grams` expects. */
export function gramsToNumber(grams: Decimal): number {
  return Number(formatDecimal(grams));
}
