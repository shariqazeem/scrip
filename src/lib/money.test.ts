import { describe, expect, it } from "vitest";
import {
  MAX_SAFE_BASE,
  ONE,
  cmpDecimal,
  formatDecimal,
  mulBase,
  parseDecimal,
  qtyForValue,
  ratio,
  returnBps,
  toSafeNumber,
  valueOfQty,
} from "./money";
import { isOk } from "./outcome";

const d = (s: string) => {
  const o = parseDecimal(s);
  if (!o.ok) throw new Error(`fixture "${s}" did not parse: ${o.why}`);
  return o.value;
};

describe("parseDecimal", () => {
  it("parses the real issuer precision exactly", () => {
    // Read off the SPYx mint on mainnet, 2026-09-12. Sixteen significant digits — already at
    // the edge of what an IEEE double holds exactly, which is why none of this uses floats.
    const o = parseDecimal("1.003909240011759");
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.units).toBe(1003909240011759n);
    expect(o.value.scale).toBe(15);
  });

  it("round-trips through formatDecimal", () => {
    for (const s of ["1", "1.5", "0.0001", "1.003909240011759", "4"]) {
      expect(formatDecimal(d(s))).toBe(s);
    }
  });

  it("refuses every shape that means the value came from somewhere unexpected", () => {
    // "1e-3" parsed loosely as 1 would leave every balance untouched while the issuer had in
    // fact cut it by a thousand. Each of these is a corrupt read, not a formatting nicety.
    for (const bad of ["", "abc", "1e-3", "+1", " 1", "1.2.3", "-1", "1,5", "."]) {
      const o = parseDecimal(bad);
      expect(o.ok, `"${bad}" should not parse`).toBe(false);
    }
  });

  it("refuses absurd precision rather than silently rounding it", () => {
    expect(parseDecimal(`1.${"1".repeat(25)}`).ok).toBe(false);
    expect(parseDecimal(`1.${"1".repeat(24)}`).ok).toBe(true);
  });
});

describe("mulBase", () => {
  it("multiplies exactly at issuer precision", () => {
    // 100 whole tokens at 8 decimals, through the live SPYx multiplier.
    const qty = 100_00000000n;
    expect(mulBase(qty, d("1.005714560286254"))).toBe(10057145602n);
  });

  it("truncates rather than rounding, so a balance can never overstate", () => {
    // 3 base units × 0.5 = 1.5 → 1. Rounding to 2 would claim a unit the wallet does not hold.
    expect(mulBase(3n, d("0.5"))).toBe(1n);
    expect(mulBase(9n, d("0.99"))).toBe(8n);
  });

  it("is the identity at a multiplier of one", () => {
    expect(mulBase(123456789n, ONE)).toBe(123456789n);
  });

  it("does not compound its truncation across a chain of changes", () => {
    // THE REASON adjusted quantity is always recomputed from RAW: the same raw quantity taken
    // through three multipliers in sequence must equal one step straight to the last, or
    // every corporate action would shave a unit off every book forever.
    const raw = 777_777_777n;
    const direct = mulBase(raw, d("1.21"));
    const chained = mulBase(mulBase(mulBase(raw, d("1.1")), d("1.05")), d("1.047619047"));
    expect(direct).not.toBe(chained);
    expect(mulBase(raw, d("1.21"))).toBe(direct); // recomputing from raw is stable
  });
});

describe("cmpDecimal", () => {
  it("compares across differing scales", () => {
    expect(cmpDecimal(d("1"), d("1.000"))).toBe(0);
    expect(cmpDecimal(d("1.0039"), d("1.0057"))).toBe(-1);
    expect(cmpDecimal(d("4"), d("1.0057"))).toBe(1);
  });
});

describe("ratio", () => {
  it("measures the size of a multiplier step", () => {
    const r = ratio(d("1.005714560286254"), d("1.003909240011759"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Number(formatDecimal(r.value))).toBeCloseTo(1.0017985, 6);
  });

  it("holds on a zero denominator rather than producing Infinity", () => {
    // Infinity renders as a balance. It must never get that far.
    const r = ratio(d("1"), d("0"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/zero multiplier/);
  });
});

describe("valueOfQty", () => {
  it("scales by the MINT's decimals, not a default", () => {
    // 1.5 SPYx at 8 decimals, $765.55 → $1,148.32
    expect(valueOfQty(1_50000000n, 8, 765_550000n)).toBe(1148_325000n);
    // The same digits read as a 6-decimal mint are a hundred times the money.
    expect(valueOfQty(1_50000000n, 6, 765_550000n)).toBe(114832_500000n);
  });
});

describe("qtyForValue", () => {
  it("sizes a position from a dollar amount", () => {
    // $100 of gold at $4,364.68/oz, 6-decimal mint.
    const q = qtyForValue(100_000000n, 6, 4364_680000n);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.value).toBe(22911n); // 0.022911 oz — 0.0229113…, truncated, never rounded up
  });

  it("holds on a non-positive price rather than dividing", () => {
    expect(qtyForValue(100_000000n, 6, 0n).ok).toBe(false);
  });
});

describe("toSafeNumber", () => {
  it("holds above the exact-integer ceiling instead of silently losing digits", () => {
    expect(isOk(toSafeNumber(MAX_SAFE_BASE, "qty"))).toBe(true);
    const o = toSafeNumber(MAX_SAFE_BASE + 1n, "qty");
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/too large to store exactly/);
  });
});

describe("returnBps", () => {
  it("measures against dollars contributed", () => {
    const r = returnBps(11_000_000n, 10_000_000n);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(1000); // +10%
  });

  it("holds rather than dividing by a zero basis", () => {
    // A sponsored first gram cost the holder nothing. "∞%" on a savings screen is worse than
    // an honest blank.
    const r = returnBps(500_000n, 0n);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/no contributed value/);
  });
});
