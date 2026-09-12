import { describe, expect, it } from "vitest";
import { assetBySymbol } from "@/lib/assets/registry";
import { fromBase } from "@/lib/format";
import type { Outcome } from "@/lib/outcome";
import { held, ok } from "@/lib/outcome";
import { MAX_LEGS as POLICY_MAX_LEGS, defaultPolicy } from "@/lib/policy";
import type { Price } from "@/lib/pyth/price";
import { allocate, allocationDustBase, named } from "./allocator";

const GOLD = assetBySymbol("GOLD")!;
const SPY = assetBySymbol("SPYx")!;
const NOW = 1_800_000_000;

const price = (dollars: number, ageSeconds = 0, confDollars = 0.2): Price => ({
  feedId: "",
  base: BigInt(Math.round(dollars * 1e6)),
  confBase: BigInt(Math.round(confDollars * 1e6)),
  publishedAt: NOW - ageSeconds,
});

/** The live prices, read off mainnet 2026-09-12. */
const prices = (over: Record<string, Outcome<Price>> = {}) =>
  new Map<string, Outcome<Price>>([
    [GOLD.mint, ok(price(4349))],
    [SPY.mint, ok(price(769.8224))],
    ...Object.entries(over),
  ]);

const usd = (n: number) => BigInt(Math.round(n * 1e6));

describe("the recipient's policy decides the proportions", () => {
  it("splits a payout 70/30 at today's prices", () => {
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const gold = a.value.legs.find((l) => l.asset.symbol === "GOLD")!;
    const spy = a.value.legs.find((l) => l.asset.symbol === "SPYx")!;
    expect(gold.bps).toBe(7000);
    expect(spy.bps).toBe(3000);
    // $700 of gold at $4,349 and $300 of SPYx at $769.8224.
    expect(fromBase(gold.valueBase, 6)).toBeCloseTo(700, 2);
    expect(fromBase(spy.valueBase, 6)).toBeCloseTo(300, 2);
  });

  it("reports what will ACTUALLY land, not what was asked for", () => {
    // Token quantities truncate, so a $1,000 request lands as slightly less. A receipt that
    // claimed the round number would be off by the dust in the payer's favour every time, in
    // a direction nobody chose.
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.valueBase).toBeLessThanOrEqual(a.value.requestedBase);
    expect(allocationDustBase(a.value)).toBeGreaterThanOrEqual(0n);
    // …and the dust is genuinely dust, not a rounding bug.
    expect(fromBase(allocationDustBase(a.value), 6)).toBeLessThan(0.01);
  });

  it("counts the grams of gold in the allocation", () => {
    const a = allocate({
      requestedBase: usd(4349),
      policy: { legs: [{ mint: GOLD.mint, bps: 10_000 }], driftBps: 0 },
      constraint: null,
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    // One troy ounce of gold at $4,349 is 31.1034768 fine grams.
    expect(Number(a.value.gramsE8) / 1e8).toBeCloseTo(31.1034768, 4);
  });
});

describe("a payer constrains the SET, never the weights", () => {
  it("re-normalises the recipient's preferences across what survives", () => {
    // "Gold only" against a 70/30 policy is not the payer dictating 100% gold — it is what
    // the recipient's own policy says about a set of one.
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: [GOLD.mint],
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.legs).toHaveLength(1);
    expect(a.value.legs[0]!.bps).toBe(10_000);
    expect(fromBase(a.value.valueBase, 6)).toBeCloseTo(1000, 1);
  });

  it("keeps the relative weights when the constraint removes nothing", () => {
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: [GOLD.mint, SPY.mint],
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.legs.map((l) => l.bps)).toEqual([7000, 3000]);
  });

  it("holds when the constraint leaves nothing the policy allows", () => {
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: [assetBySymbol("GLDx")!.mint],
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.why).toMatch(/leaves nothing this policy allows/);
  });
});

describe("an allocation holds as a whole, never in part", () => {
  it("refuses everything when ONE leg cannot be priced", () => {
    // A book that cannot price gold still renders, with the gold leg shown and unvalued.
    // Three legs where a policy called for four is a different allocation, and nobody
    // signed it.
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices({ [GOLD.mint]: held("gold feed is 9 hours old") }),
      now: NOW,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.why).toMatch(/GOLD: gold feed is 9 hours old/);
  });

  it("settles gold against a weekend-stale feed, and refuses one past its own bound", () => {
    /**
     * THE BOUND IS PER FEED, and the reason is measurable: Pyth's metal feed sat nine hours
     * stale on a Saturday because the metal market was shut. A sixty-second bound applied to
     * every asset would have made gold — the product's headline — unpayable half the week,
     * which is not more honest than settling against a nine-hour price and saying so.
     */
    const nineHours = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices({ [GOLD.mint]: ok(price(4349, 9 * 3600)) }),
      now: NOW,
    });
    expect(nineHours.ok).toBe(true);

    const pastTheBound = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices({ [GOLD.mint]: ok(price(4349, GOLD.price.maxSettleAgeSeconds + 60)) }),
      now: NOW,
    });
    expect(pastTheBound.ok).toBe(false);
    if (pastTheBound.ok) return;
    expect(pastTheBound.why).toMatch(/too old to move money against/);
  });

  it("holds the equity sleeve to a much tighter bound than the metal", () => {
    // SPYX/USD is pushed continuously; XAU/USD is not. A bound that ignored that difference
    // would be wrong in one direction or the other for one of them.
    expect(SPY.price.maxSettleAgeSeconds).toBeLessThan(GOLD.price.maxSettleAgeSeconds);
    const staleEquity = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices({ [SPY.mint]: ok(price(769.8224, SPY.price.maxSettleAgeSeconds + 60)) }),
      now: NOW,
    });
    expect(staleEquity.ok).toBe(false);
  });

  it("refuses a price under a wide confidence band", () => {
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices({ [SPY.mint]: ok(price(769.8224, 0, 50)) }),
      now: NOW,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.why).toMatch(/confidence band/);
  });

  it("refuses an amount so small a leg rounds to nothing", () => {
    // Escrowing zero and printing it on a receipt as an arrival would be a false receipt.
    const a = allocate({
      requestedBase: 1n, // one millionth of a dollar
      policy: defaultPolicy(),
      constraint: null,
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.why).toMatch(/rounds to nothing/);
  });

  it("refuses a zero or negative request", () => {
    for (const v of [0n, -1n]) {
      expect(
        allocate({
          requestedBase: v,
          policy: defaultPolicy(),
          constraint: null,
          prices: prices(),
          now: NOW,
        }).ok,
      ).toBe(false);
    }
  });
});

describe("a named gift skips allocation entirely", () => {
  it("stays exactly what it was named as", () => {
    // 0.2 grams of gold stays 0.2 grams of gold. Only unspecified value converts.
    const twoTenthsOfAnOunce = 200_000n; // 0.2 GOLD at 6 decimals
    const a = named(GOLD.mint, twoTenthsOfAnOunce, price(4349), NOW);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.legs).toHaveLength(1);
    expect(a.value.legs[0]!.amount).toBe(twoTenthsOfAnOunce);
    expect(fromBase(a.value.valueBase, 6)).toBeCloseTo(869.8, 1);
    expect(allocationDustBase(a.value)).toBe(0n);
  });

  it("still refuses to settle against a price past that feed's bound", () => {
    expect(named(GOLD.mint, 200_000n, price(4349, 9 * 3600), NOW).ok).toBe(true);
    expect(
      named(GOLD.mint, 200_000n, price(4349, GOLD.price.maxSettleAgeSeconds + 60), NOW).ok,
    ).toBe(false);
  });

  it("refuses an asset Webgold does not know", () => {
    expect(named("11111111111111111111111111111111", 1n, price(1), NOW).ok).toBe(false);
  });
});

describe("an allocation always satisfies what the program will check", () => {
  /**
   * The program's `check_legs` refuses an empty payout, a zero-amount leg, a duplicated mint,
   * the default pubkey, and more legs than a policy can hold. The allocator does not re-check
   * any of those — it does not need to, because a valid policy plus its own zero-guard makes
   * them structurally impossible.
   *
   * "Does not need to" is an argument, and an argument about money belongs in a test.
   */
  const MAX_PAYOUT_LEGS = 8;

  it("produces legs the program's check_legs would accept", () => {
    const a = allocate({
      requestedBase: usd(1000),
      policy: defaultPolicy(),
      constraint: null,
      prices: prices(),
      now: NOW,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    expect(a.value.legs.length).toBeGreaterThan(0);
    expect(a.value.legs.length).toBeLessThanOrEqual(MAX_PAYOUT_LEGS);
    for (const leg of a.value.legs) {
      expect(leg.amount).toBeGreaterThan(0n);
      expect(leg.asset.mint).not.toBe("11111111111111111111111111111111");
    }
    const mints = a.value.legs.map((l) => l.asset.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it("cannot exceed the payout leg ceiling, because a policy cannot", () => {
    // MAX_LEGS on a policy and MAX_PAYOUT_LEGS on a payout are the same number on purpose:
    // a payout cannot be more finely divided than the policy that decided it.
    expect(POLICY_MAX_LEGS).toBe(MAX_PAYOUT_LEGS);
  });
});
