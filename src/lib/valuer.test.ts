import { describe, expect, it } from "vitest";
import { assetBySymbol } from "@/lib/assets/registry";
import { formatDecimal } from "@/lib/money";
import type { Outcome } from "@/lib/outcome";
import { held, ok } from "@/lib/outcome";
import type { Price } from "@/lib/pyth/price";
import { type Holding, freshnessNote, gramsOf, valueBook, valueLeg } from "./valuer";

const GOLD = assetBySymbol("GOLD")!;
const SPY = assetBySymbol("SPYx")!;
const USDC = assetBySymbol("USDC")!;
const NOW = 1_800_000_000;

const price = (dollars: number, ageSeconds = 0, confDollars = 0.2): Price => ({
  feedId: "",
  base: BigInt(Math.round(dollars * 1e6)),
  confBase: BigInt(Math.round(confDollars * 1e6)),
  publishedAt: NOW - ageSeconds,
});

const whole = (n: number, decimals: number) => BigInt(Math.round(n * 10 ** decimals));

describe("a leg is valued through the basis its feed declares", () => {
  it("prices SPYx from the RAW quantity, because SPYX/USD already carries the multiplier", () => {
    // The live shape on 2026-09-12: 100 raw tokens at $769.8224, and a multiplier of
    // 1.005714560286254 making them 100.5714… share-equivalents.
    const holding: Holding = {
      asset: SPY,
      qtyRaw: whole(100, SPY.decimals),
      qtyAdjusted: whole(100.5714560286254, SPY.decimals),
    };
    const o = valueLeg(holding, price(769.8224), "display", NOW);
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.valueBase).toBe(76_982_240_000n); // $76,982.24
  });

  it("would be wrong by exactly the multiplier if it used the adjusted quantity", () => {
    // THE BUG ARRIVING THROUGH THE PRICE INSTEAD OF THE QUANTITY, and it looks just as
    // plausible: multiplying a token price that already includes the multiplier by a quantity
    // that also includes it applies it twice.
    const adjusted = whole(100.5714560286254, SPY.decimals);
    const doubleCounted = (adjusted * 769_822400n) / 10n ** BigInt(SPY.decimals);
    expect(doubleCounted).toBeGreaterThan(76_982_240_000n);
    expect(Number(doubleCounted) / 76_982_240_000).toBeCloseTo(1.0057145, 6);
  });

  it("prices gold per troy ounce, one token at a time", () => {
    const holding: Holding = {
      asset: GOLD,
      qtyRaw: whole(2, GOLD.decimals),
      qtyAdjusted: whole(2, GOLD.decimals),
    };
    const o = valueLeg(holding, price(4349), "display", NOW);
    expect(o.ok && o.value.valueBase).toBe(8_698_000_000n); // $8,698
  });

  it("holds a leg whose price is past its feed's settle bound, without blanking it for display", () => {
    const holding: Holding = { asset: GOLD, qtyRaw: whole(1, 6), qtyAdjusted: whole(1, 6) };
    const pastBound = price(4349, GOLD.price.maxSettleAgeSeconds + 60);
    expect(valueLeg(holding, pastBound, "settle", NOW).ok).toBe(false);
    // …and it is still SHOWN, with its age. A book that blanks is not more honest than one
    // that says how old its numbers are.
    expect(valueLeg(holding, pastBound, "display", NOW).ok).toBe(true);
  });
});

describe("valueBook", () => {
  const holdings: Holding[] = [
    { asset: GOLD, qtyRaw: whole(1.5, 6), qtyAdjusted: whole(1.5, 6) },
    {
      asset: SPY,
      qtyRaw: whole(10, 8),
      qtyAdjusted: whole(10.05714560286254, 8),
    },
    { asset: USDC, qtyRaw: whole(250, 6), qtyAdjusted: whole(250, 6) },
  ];

  const prices = (over: Record<string, Outcome<Price>> = {}) =>
    new Map<string, Outcome<Price>>([
      [GOLD.mint, ok(price(4349))],
      [SPY.mint, ok(price(769.8224))],
      [USDC.mint, ok(price(0.9999))],
      ...Object.entries(over),
    ]);

  it("adds up the legs it can price", () => {
    const v = valueBook(holdings, prices(), "display", NOW);
    // 1.5 × 4349 = 6,523.50 · 10 × 769.8224 = 7,698.224 · 250 × 0.9999 = 249.975
    expect(v.valueBase).toBe(6_523_500_000n + 7_698_224_000n + 249_975_000n);
    expect(v.legs).toHaveLength(3);
    expect(v.heldLegs).toHaveLength(0);
  });

  it("holds ONE leg without blanking the book", () => {
    // A stale gold feed must not take SPYx down with it.
    const v = valueBook(holdings, prices({ [GOLD.mint]: held("gold feed is 9 days old") }), "display", NOW);
    expect(v.legs.map((l) => l.asset.symbol)).toEqual(["SPYx", "USDC"]);
    expect(v.heldLegs).toHaveLength(1);
    expect(v.heldLegs[0]!.why).toMatch(/GOLD: gold feed is 9 days old/);
  });

  it("never silently drops a held leg from the story", () => {
    // "Worth nothing" and "we could not see it" are very different claims, and only one is
    // true. The held leg keeps its quantity so a surface can show the holding without a value.
    const v = valueBook(holdings, prices({ [GOLD.mint]: held("stale") }), "display", NOW);
    expect(v.heldLegs[0]!.qtyAdjusted).toBe(whole(1.5, 6));
  });

  it("holds a leg for which no price was fetched at all", () => {
    const v = valueBook(holdings, new Map(), "display", NOW);
    expect(v.legs).toHaveLength(0);
    expect(v.heldLegs).toHaveLength(3);
    expect(v.heldLegs[0]!.why).toMatch(/no price was fetched/);
  });

  it("reports the age of the oldest price behind the total", () => {
    const v = valueBook(
      holdings,
      prices({ [GOLD.mint]: ok(price(4349, 9 * 3600)) }),
      "display",
      NOW,
    );
    expect(v.oldestPriceAgeSeconds).toBe(9 * 3600);
    expect(freshnessNote(v)).toBe("priced 9 hours ago");
  });

  it("says nothing about freshness when it priced nothing", () => {
    expect(freshnessNote(valueBook([], new Map(), "display", NOW))).toBeNull();
  });
});

describe("grams", () => {
  it("converts troy ounces of allocated metal into fine grams", () => {
    const v = valueBook(
      [{ asset: GOLD, qtyRaw: whole(2, 6), qtyAdjusted: whole(2, 6) }],
      new Map([[GOLD.mint, ok(price(4349))]]),
      "display",
      NOW,
    );
    // 2 troy ounces × 31.1034768 g
    expect(formatDecimal(v.grams)).toBe("62.2069536");
  });

  it("NEVER counts a fund that tracks gold as grams", () => {
    // The rule the whole product rests on. GLDx is a share of the SPDR fund, not an ounce,
    // and it does not get to round out the headline number.
    const gldx = assetBySymbol("GLDx")!;
    expect(gldx.kind).toBe("fund");
    const legs = valueBook(
      [{ asset: gldx, qtyRaw: whole(100, 8), qtyAdjusted: whole(100, 8) }],
      new Map([[gldx.mint, ok(price(398.48))]]),
      "display",
      NOW,
    );
    expect(formatDecimal(legs.grams)).toBe("0");
    // …and it is still VALUED. Not counted as gold is not the same as not counted at all.
    expect(legs.valueBase).toBe(39_848_000_000n);
  });

  it("counts nothing when a book holds no metal", () => {
    expect(formatDecimal(gramsOf([]))).toBe("0");
  });
});
