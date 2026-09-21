import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_INBOUND,
  ESCALATION_PERIOD_SECONDS,
  FEED_MAX_AGE_SECONDS,
  MAX_CONF_BPS,
  MAX_RATE_BPS,
  MAX_TOLERANCE_BPS,
  MIN_SLICE,
  MIN_TOLERANCE_BPS,
  computeSlice,
  effectiveRate,
  preview,
  sweepsCovered,
  validateRule,
} from "./slice";

/**
 * THE MIRROR IS HELD TO THE ORIGINAL. This file reads `rule.rs` and compares every constant,
 * because a client that disagrees with the program either builds transactions the program
 * refuses (the person pays a fee to be told no) or refuses ones it would accept (a choice
 * silently removed).
 */
const rust = readFileSync(join(__dirname, "..", "..", "..", "anchor", "programs", "scrip", "src", "rule.rs"), "utf8");

function rustConst(name: string): string {
  const m = new RegExp(`pub const ${name}: \\w+ = ([^;]+);`).exec(rust);
  if (!m) throw new Error(`${name} is not declared in rule.rs`);
  return m[1]!.replace(/_/g, "").trim();
}

describe("the TypeScript constants match the program's", () => {
  it("MAX_RATE_BPS", () => expect(String(MAX_RATE_BPS)).toBe(rustConst("MAX_RATE_BPS")));
  it("ESCALATION_PERIOD", () => {
    expect(String(ESCALATION_PERIOD_SECONDS)).toBe(String(eval(rustConst("ESCALATION_PERIOD"))));
  });
  it("MIN_SLICE", () => expect(MIN_SLICE.toString()).toBe(rustConst("MIN_SLICE")));
  it("DEFAULT_MIN_INBOUND", () => expect(DEFAULT_MIN_INBOUND.toString()).toBe(rustConst("DEFAULT_MIN_INBOUND")));
  it("MIN_TOLERANCE_BPS", () => expect(String(MIN_TOLERANCE_BPS)).toBe(rustConst("MIN_TOLERANCE_BPS")));
  it("MAX_TOLERANCE_BPS", () => expect(String(MAX_TOLERANCE_BPS)).toBe(rustConst("MAX_TOLERANCE_BPS")));
  it("FEED_MAX_AGE", () => expect(String(FEED_MAX_AGE_SECONDS)).toBe(rustConst("FEED_MAX_AGE")));
  it("MAX_CONF_BPS", () => expect(String(MAX_CONF_BPS)).toBe(rustConst("MAX_CONF_BPS")));
});

const base = { minInbound: DEFAULT_MIN_INBOUND, cap: 0n, floor: 0n, rateBps: 1_000 };

describe("computeSlice mirrors compute_slice", () => {
  it("ten percent of a $500 arrival", () => {
    const s = computeSlice({ ...base, balance: 500_000_000n, watermark: 0n });
    expect(s.ok && s.value.slice).toBe(50_000_000n);
    expect(s.ok && s.value.watermarkAfter).toBe(450_000_000n);
  });

  it("only the net increase since the watermark is income", () => {
    const s = computeSlice({ ...base, balance: 1_200_000_000n, watermark: 1_000_000_000n });
    expect(s.ok && s.value.inbound).toBe(200_000_000n);
    expect(s.ok && s.value.slice).toBe(20_000_000n);
  });

  it("spending is not income", () => {
    const fell = computeSlice({ ...base, balance: 300_000_000n, watermark: 1_000_000_000n });
    expect(fell.ok).toBe(false);
    const then = computeSlice({ ...base, balance: 350_000_000n, watermark: 300_000_000n });
    expect(then.ok && then.value.slice).toBe(5_000_000n);
  });

  it("an inflow below $1 is ignored, and a slice below $0.50 is refused", () => {
    expect(computeSlice({ ...base, balance: 900_000n, watermark: 0n }).ok).toBe(false);
    expect(computeSlice({ ...base, balance: 4_000_000n, watermark: 0n }).ok).toBe(false);
    const edge = computeSlice({ ...base, balance: 5_000_000n, watermark: 0n });
    expect(edge.ok && edge.value.slice).toBe(MIN_SLICE);
  });

  it("the cap bounds what one inflow is taxed on", () => {
    const s = computeSlice({ ...base, balance: 20_000_000_000n, watermark: 0n, cap: 5_000_000_000n });
    expect(s.ok && s.value.taxable).toBe(5_000_000_000n);
    expect(s.ok && s.value.slice).toBe(500_000_000n);
  });

  it("the floor keeps cash the owner needs", () => {
    const s = computeSlice({ ...base, balance: 120_000_000n, watermark: 0n, floor: 110_000_000n });
    expect(s.ok && s.value.slice).toBe(10_000_000n);
    expect(computeSlice({ ...base, balance: 100_000_000n, watermark: 0n, floor: 200_000_000n }).ok).toBe(false);
  });
});

describe("effectiveRate mirrors effective_rate", () => {
  const t0 = 1_700_000_000;
  it("adds one step per full period and stops at the ceiling", () => {
    expect(effectiveRate(1_000, 100, t0, t0)).toBe(1_000);
    expect(effectiveRate(1_000, 100, t0, t0 + ESCALATION_PERIOD_SECONDS - 1)).toBe(1_000);
    expect(effectiveRate(1_000, 100, t0, t0 + ESCALATION_PERIOD_SECONDS)).toBe(1_100);
    expect(effectiveRate(1_000, 100, t0, t0 + 4 * ESCALATION_PERIOD_SECONDS)).toBe(1_400);
    expect(effectiveRate(4_950, 100, t0, t0 + 10 * ESCALATION_PERIOD_SECONDS)).toBe(MAX_RATE_BPS);
    expect(effectiveRate(1_000, 0, t0, t0 + 100 * ESCALATION_PERIOD_SECONDS)).toBe(1_000);
  });
});

describe("validateRule mirrors check_rule_ranges", () => {
  const good = { rateBps: 1_000, escalateBps: 100, floorUsdc: 0n, capUsdc: 5_000_000_000n, toleranceBps: 100 };
  it("accepts the defaults and the edges", () => {
    expect(validateRule(good).ok).toBe(true);
    expect(validateRule({ ...good, rateBps: 1 }).ok).toBe(true);
    expect(validateRule({ ...good, rateBps: MAX_RATE_BPS, escalateBps: MAX_RATE_BPS, toleranceBps: MAX_TOLERANCE_BPS }).ok).toBe(true);
  });
  it("refuses what the program refuses", () => {
    expect(validateRule({ ...good, rateBps: 0 }).ok).toBe(false);
    expect(validateRule({ ...good, rateBps: MAX_RATE_BPS + 1 }).ok).toBe(false);
    expect(validateRule({ ...good, escalateBps: MAX_RATE_BPS + 1 }).ok).toBe(false);
    expect(validateRule({ ...good, toleranceBps: MIN_TOLERANCE_BPS - 1 }).ok).toBe(false);
    expect(validateRule({ ...good, toleranceBps: MAX_TOLERANCE_BPS + 1 }).ok).toBe(false);
    expect(validateRule({ ...good, rateBps: 10.5 }).ok).toBe(false);
  });
});

describe("preview", () => {
  it("says what $500 becomes under the default terms", () => {
    const p = preview(500_000_000n, { rateBps: 1_000, escalateBps: 0, floorUsdc: 0n, capUsdc: 5_000_000_000n, toleranceBps: 100 });
    expect(p.ok && p.value.slice).toBe(50_000_000n);
  });
  it("covers about fourteen sweeps with the suggested float", () => {
    expect(sweepsCovered(50_000_000n)).toBe(14);
  });
});
