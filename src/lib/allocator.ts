import { type Asset, assetByMint } from "@/lib/assets/registry";
import { type Decimal, mulBase, parseDecimal, qtyForValue, valueOfQty } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import { TOTAL_BPS, type Policy } from "@/lib/policy";
import { type Price, usable } from "@/lib/pyth/price";
import { gramsOf } from "@/lib/valuer";

/**
 * THE ALLOCATOR — a dollar amount becomes somebody's mix, and nothing here chooses it.
 *
 * Three inputs, and each has exactly one job:
 *
 *   the RECIPIENT's signed policy   decides the proportions. Only this.
 *   the PAYER's constraint          decides which assets are eligible. Never the proportions.
 *   Pyth                            decides the prices.
 *
 * A payer who says "gold only" against a 70/30 policy does not get to say "and all of it in
 * gold at whatever weight I like" — they have narrowed the SET, and the recipient's own
 * relative preferences are then re-normalised across what remains. With one asset left that
 * comes to 100% of it, which looks like the payer dictating and is not: it is what the
 * recipient's policy says about a set of one.
 *
 * IT HOLDS AS A WHOLE, NEVER IN PART. A book that cannot price one leg still renders — see
 * the valuer, where a held leg is shown without a value. An ALLOCATION cannot do that. Three
 * legs where a policy called for four is a different allocation, and nobody signed it.
 */

export type AllocationLeg = {
  readonly asset: Asset;
  /** Token base units to transfer. What actually moves. */
  readonly amount: bigint;
  /** USD value of this leg at the stamp, 6-decimal base units. */
  readonly valueBase: bigint;
  /** The weight this leg was given AFTER any constraint re-normalised it. */
  readonly bps: number;
  readonly price: Price;
};

export type Allocation = {
  readonly legs: readonly AllocationLeg[];
  /**
   * The value that will ACTUALLY land: the sum of the legs. Never the amount requested.
   *
   * Token quantities truncate, so a $100 request lands as $99.999997 of assets. A receipt
   * that claimed the round number would be off by the dust in the payer's favour, every
   * time, in a direction nobody chose. The dust simply stays with the payer.
   */
  readonly valueBase: bigint;
  /** What was asked for, so a surface can show the difference rather than hide it. */
  readonly requestedBase: bigint;
  /** Fine grams of gold in this allocation, 1e8 fixed point, stamped now. */
  readonly gramsE8: bigint;
};

export type AllocationInput = {
  /** USD value the payer is releasing, 6-decimal base units. */
  readonly requestedBase: bigint;
  /** The RECIPIENT's signed policy. The only source of weights. */
  readonly policy: Policy;
  /** Mints the payer will allow. null means no constraint — the whole policy applies. */
  readonly constraint: readonly string[] | null;
  readonly prices: ReadonlyMap<string, Outcome<Price>>;
  /** Multipliers, for any asset whose price feed is quoted per ADJUSTED unit. */
  readonly multipliers?: ReadonlyMap<string, Decimal>;
  readonly now: number;
};

export function allocate(input: AllocationInput): Outcome<Allocation> {
  const { requestedBase, policy, constraint, prices, now } = input;
  if (requestedBase <= 0n) return held("There is nothing to allocate.");

  const eligible = policy.legs.filter(
    (l) => (constraint === null || constraint.includes(l.mint)) && assetByMint(l.mint),
  );
  if (eligible.length === 0) {
    return held(
      constraint === null
        ? "This policy names no asset Webgold can settle."
        : "This payer's constraint leaves nothing this policy allows.",
    );
  }

  // RE-NORMALISE, DO NOT RESCALE THE VALUE. The recipient keeps their relative preferences
  // across whatever survives the constraint; the payer's dollar amount is untouched.
  const totalBps = eligible.reduce((n, l) => n + l.bps, 0);
  if (totalBps <= 0) return held("This policy's eligible weights add up to nothing.");

  const legs: AllocationLeg[] = [];
  for (const leg of eligible) {
    const asset = assetByMint(leg.mint)!;
    const priceOutcome = prices.get(leg.mint);
    if (!priceOutcome) return held(`${asset.symbol}: no price was fetched for this asset.`);
    if (!priceOutcome.ok) return held(`${asset.symbol}: ${priceOutcome.why}`);

    // "settle" strictness: money is about to move, so a price past this feed's own bound, or
    // under a wide confidence band, is refused outright. The bound is per feed because the
    // feeds behave differently — see `PriceFeed.maxSettleAgeSeconds`.
    const check = usable(priceOutcome.value, "settle", now, asset.price.maxSettleAgeSeconds);
    if (!check.ok) return held(`${asset.symbol}: ${check.why}`);
    const price = check.value;

    const bps = Math.round((leg.bps * TOTAL_BPS) / totalBps);
    const target = (requestedBase * BigInt(bps)) / BigInt(TOTAL_BPS);

    const qty = qtyForValue(target, asset.decimals, price.base);
    if (!qty.ok) return held(`${asset.symbol}: ${qty.why}`);

    // A quantity quoted against an ADJUSTED-basis feed is in share-equivalents; what gets
    // TRANSFERRED is raw token units, and the two differ by the multiplier.
    let amount = qty.value;
    if (asset.price.basis === "adjusted") {
      const m = input.multipliers?.get(leg.mint);
      if (!m) {
        return held(
          `${asset.symbol}: its price is quoted per share-equivalent, and the multiplier needed to convert that into tokens could not be read.`,
        );
      }
      const scaled = mulBase(amount * 10n ** 12n, m) / 10n ** 12n;
      if (scaled <= 0n) return held(`${asset.symbol}: the amount rounds to nothing.`);
      amount = scaled;
    }

    if (amount <= 0n) {
      // A leg that rounds to zero cannot be escrowed and must not be printed on a receipt as
      // an arrival of nothing.
      return held(
        `${asset.symbol}: a ${bps / 100}% share of this amount rounds to nothing at today's price.`,
      );
    }

    legs.push({
      asset,
      amount,
      valueBase: valueOfQty(amount, asset.decimals, price.base),
      bps,
      price,
    });
  }

  const valueBase = legs.reduce((sum, l) => sum + l.valueBase, 0n);
  const grams = gramsOf(
    legs.map((l) => ({
      asset: l.asset,
      qtyRaw: l.amount,
      qtyAdjusted: l.amount,
      valueBase: l.valueBase,
      price: l.price,
      ageSeconds: 0,
      source: l.asset.price.label,
    })),
  );
  // gramsOf returns a Decimal at scale 8, which is exactly the 1e8 fixed point the program
  // stores. Asserted rather than assumed, because a silent scale change here would multiply
  // every gram figure on every receipt by a power of ten.
  const gramsE8 = grams.scale === 8 ? grams.units : rescale(grams, 8);

  return ok({ legs, valueBase, requestedBase, gramsE8 });
}

function rescale(d: Decimal, scale: number): bigint {
  if (d.scale === scale) return d.units;
  return d.scale > scale
    ? d.units / 10n ** BigInt(d.scale - scale)
    : d.units * 10n ** BigInt(scale - d.scale);
}

/** The dust left behind by truncation — shown, never hidden. */
export function allocationDustBase(a: Allocation): bigint {
  return a.requestedBase - a.valueBase;
}

/** A named gift skips allocation entirely: 0.2 grams of gold stays 0.2 grams of gold. */
export function named(
  mint: string,
  amount: bigint,
  price: Price,
  now: number,
): Outcome<Allocation> {
  const asset = assetByMint(mint);
  if (!asset) return held("Webgold does not know how to settle that asset.");
  if (amount <= 0n) return held("There is nothing to send.");
  const check = usable(price, "settle", now, asset.price.maxSettleAgeSeconds);
  if (!check.ok) return held(`${asset.symbol}: ${check.why}`);

  const valueBase = valueOfQty(amount, asset.decimals, check.value.base);
  const leg: AllocationLeg = { asset, amount, valueBase, bps: TOTAL_BPS, price: check.value };
  const grams = gramsOf([
    {
      asset,
      qtyRaw: amount,
      qtyAdjusted: amount,
      valueBase,
      price: check.value,
      ageSeconds: 0,
      source: asset.price.label,
    },
  ]);
  return ok({
    legs: [leg],
    valueBase,
    requestedBase: valueBase,
    gramsE8: grams.scale === 8 ? grams.units : rescale(grams, 8),
  });
}

/** Grams, as a display number, from the 1e8 fixed point the program stores. */
export function gramsFromE8(e8: bigint): number {
  const d = parseDecimal((Number(e8) / 1e8).toFixed(8));
  return d.ok ? Number((Number(e8) / 1e8).toFixed(8)) : 0;
}
