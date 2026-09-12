import { describe, expect, it } from "vitest";
import { type Decimal, mulBase, parseDecimal, returnBps } from "@/lib/money";
import { type Position, positionValue, quantityFromCorporateActions, reconcile } from "./reconcile";

const d = (s: string): Decimal => {
  const o = parseDecimal(s);
  if (!o.ok) throw new Error(o.why);
  return o.value;
};

/** SPYx decimals, read from the mint. */
const DEC = 8;
const usd = (dollars: number) => BigInt(Math.round(dollars * 1e6));

/** A position opened at a given multiplier, for a given number of whole tokens and dollars. */
function open(wholeTokens: number, atMultiplier: Decimal, contributedDollars: number): Position {
  // The chain holds RAW units. An owner who paid for N adjusted tokens at multiplier m holds
  // raw = N / m — which is exactly why raw and adjusted must be stored separately.
  const adjusted = BigInt(Math.round(wholeTokens * 10 ** DEC));
  const raw = (adjusted * 10n ** BigInt(atMultiplier.scale)) / atMultiplier.units;
  return {
    qtyRaw: raw,
    qtyAdjusted: mulBase(raw, atMultiplier),
    contributedBase: usd(contributedDollars),
    multiplierAtEntry: atMultiplier,
  };
}

describe("a reinvested dividend is not a gain", () => {
  /**
   * The real shape, from the live SPYx mint: the issuer raises the multiplier so every holder
   * ends up with more units, and the share price has dropped by the dividend on the ex-date.
   * The portfolio is worth the same at that instant, and the product must say so.
   *
   * 100 shares at $100 = $10,000 contributed. A $2/share dividend is reinvested: the price
   * goes to $98 and the multiplier goes to 100/98.
   */
  const before = open(100, d("1"), 10_000);
  const after = reconcile(before, d("1.020408163265306"), d("1"));

  it("leaves the value where it was", () => {
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const valueBefore = positionValue(before, DEC, usd(100));
    const valueAfter = positionValue(after.value.position, DEC, usd(98));
    // Within a base unit — the only difference is the single truncation in the multiply.
    expect(Number(valueAfter - valueBefore)).toBeLessThanOrEqual(1);
    expect(Number(valueAfter - valueBefore)).toBeGreaterThanOrEqual(-1);
  });

  it("leaves the return at zero, rather than reading the extra units as profit", () => {
    // THE BUG: 102.04 units valued at the ENTRY price of $100 is $10,204 against $10,000
    // contributed — a 2% gain that nobody earned, printed on the day of a dividend.
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const r = returnBps(positionValue(after.value.position, DEC, usd(98)), after.value.position.contributedBase);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.value)).toBeLessThanOrEqual(1); // zero, to a basis point
  });

  it("does not move the dollars contributed", () => {
    // The DRIP convention would add $200 here and render the day as a 1.96% LOSS — the mirror
    // image of the bug, and worse, because nothing explains a loss on the day you earned.
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.position.contributedBase).toBe(usd(10_000));
  });

  it("shows up as return later, when the price recovers — which is when it was one", () => {
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const r = returnBps(positionValue(after.value.position, DEC, usd(100)), usd(10_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(204); // +2.04% — the dividend, earned and now visible
  });
});

describe("a 4-for-1 split is not a 300% return", () => {
  /** 100 shares at $200 = $20,000 contributed. Split 4-for-1: price $50, multiplier ×4. */
  const before = open(100, d("1"), 20_000);
  const after = reconcile(before, d("4"), d("1"));

  it("quadruples the quantity", () => {
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.position.qtyAdjusted).toBe(before.qtyAdjusted * 4n);
    expect(after.value.position.qtyRaw).toBe(before.qtyRaw); // the chain never moved
  });

  it("leaves the value and the return exactly where they were", () => {
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(positionValue(before, DEC, usd(200))).toBe(usd(20_000));
    expect(positionValue(after.value.position, DEC, usd(50))).toBe(usd(20_000));
    const r = returnBps(positionValue(after.value.position, DEC, usd(50)), usd(20_000));
    expect(r.ok && r.value).toBe(0);
  });

  it("is what the naive version gets wrong, by exactly 300%", () => {
    // The bug, written out: today's adjusted quantity against the ENTRY price. This is the
    // number every raw-balance product in the category will print on a split day.
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const naive = returnBps(positionValue(after.value.position, DEC, usd(200)), usd(20_000));
    expect(naive.ok && naive.value).toBe(30_000); // +300%, and entirely imaginary
  });
});

describe("a reverse split is not a 90% loss", () => {
  it("holds value flat through a 1-for-10", () => {
    const before = open(1000, d("1"), 5_000);
    const after = reconcile(before, d("0.1"), d("1"));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(positionValue(before, DEC, usd(5))).toBe(usd(5_000));
    expect(positionValue(after.value.position, DEC, usd(50))).toBe(usd(5_000));
  });
});

describe("a position opened mid-cycle values correctly after a later split", () => {
  /**
   * The case that catches an implementation storing quantity at entry and nothing else: a
   * holder who arrived AFTER one dividend and before a split. Their entry multiplier is not
   * 1, so every later re-expression has to start from raw, not from the number on the screen
   * the day they joined.
   */
  const entry = d("1.005714560286254"); // the live SPYx value on 2026-09-12
  const before = open(50, entry, 38_277.55); // 50 shares at $765.551

  it("re-expresses from raw, not from the adjusted quantity it was opened with", () => {
    const after = reconcile(before, d("4.022858241145016"), entry); // a 4-for-1 on top
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    // 4x the shares...
    expect(Number(after.value.position.qtyAdjusted)).toBeCloseTo(Number(before.qtyAdjusted) * 4, -2);
    // ...and the same money.
    const v0 = positionValue(before, DEC, usd(765.551));
    const v1 = positionValue(after.value.position, DEC, usd(765.551 / 4));
    expect(Number(v1 - v0)).toBeLessThanOrEqual(2);
    expect(Number(v1 - v0)).toBeGreaterThanOrEqual(-2);
  });

  it("attributes only the quantity that came from corporate actions since entry", () => {
    // "0.28 of your shares arrived as reinvested dividends" — true, checkable against the
    // mint, and a thing a raw-balance product cannot say at all.
    const later = d("1.011428"); // roughly another dividend on top of the entry multiplier
    const fromActions = quantityFromCorporateActions(before, later);
    expect(fromActions).toBeGreaterThan(0n);
    expect(Number(fromActions) / 10 ** DEC).toBeCloseTo(0.2841, 3);
  });

  it("reports no corporate-action quantity for a holder who has seen none", () => {
    const fresh = open(10, entry, 7_655.51);
    expect(quantityFromCorporateActions(fresh, entry)).toBe(0n);
  });
});

describe("reconciliation is idempotent", () => {
  it("cannot move a balance by being run twice", () => {
    // The property that recomputing from RAW buys: a watcher that re-runs after a crash, or
    // twice on the same change, converges instead of compounding.
    const pos = open(100, d("1"), 10_000);
    const once = reconcile(pos, d("1.0057"), d("1"));
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = reconcile(once.value.position, d("1.0057"), d("1.0057"));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.value.position.qtyAdjusted).toBe(once.value.position.qtyAdjusted);
    expect(twice.value.unchanged).toBe(true);
  });
});

describe("reconcile holds rather than computing nonsense", () => {
  it("refuses a non-positive multiplier", () => {
    const pos = open(100, d("1"), 10_000);
    const o = reconcile(pos, d("0"), d("1"));
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/non-positive multiplier/);
  });

  it("refuses a negative raw quantity", () => {
    const o = reconcile(
      { qtyRaw: -1n, qtyAdjusted: 0n, contributedBase: 0n, multiplierAtEntry: d("1") },
      d("1"),
      d("1"),
    );
    expect(o.ok).toBe(false);
  });
});

describe("the note on the receipt", () => {
  it("says what happened without claiming why", () => {
    // Webgold settles; it does not judge. The receipt states the multiplier move and the
    // quantity that followed from it — labelling the event a "dividend" would be an
    // assertion about an issuer's intent that nothing here can verify.
    const pos = open(100, d("1"), 10_000);
    const o = reconcile(pos, d("4"), d("1"));
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.note).toContain("1 → 4");
    expect(o.value.note).toContain("dollars contributed unchanged");
    expect(o.value.note.toLowerCase()).not.toContain("dividend");
    expect(o.value.note.toLowerCase()).not.toContain("split");
  });
});
