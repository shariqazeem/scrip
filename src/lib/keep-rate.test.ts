import { describe, expect, it } from "vitest";
import { type ReceiptRow, dueForMeasurement, firstMaturity, keepRate } from "./keep-rate";

const DAY = 86_400;
const T0 = 1_789_000_000;

function row(over: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    recipient: "alice",
    asset: "SPYx",
    settledUnix: T0,
    paidUsdc: 50_000_000n, // $50
    amountRaw: 6_500_000n, // 0.065 SPYx
    measured7dRaw: null,
    measured30dRaw: null,
    ...over,
  };
}

describe("keepRate", () => {
  it("holds before any receipt is old enough, and says when one will be", () => {
    const r = keepRate([row()], 7, T0 + 3 * DAY);
    expect(r.ok).toBe(false);
    expect(firstMaturity([row()], 7, T0 + 3 * DAY)).toBe(T0 + 7 * DAY);
  });

  it("holds when a matured receipt was never measured, rather than counting it as spent", () => {
    const r = keepRate([row()], 7, T0 + 8 * DAY);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/measured/);
  });

  it("holds when only part of the cohort was measured", () => {
    const rows = [row({ measured7dRaw: 6_500_000n }), row({ recipient: "bob" })];
    const r = keepRate(rows, 7, T0 + 8 * DAY);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/1 of 2/);
  });

  it("reads 100% when everything is still held", () => {
    const r = keepRate([row({ measured7dRaw: 6_500_000n })], 7, T0 + 8 * DAY);
    expect(r.ok && r.value.bps).toBe(10_000);
  });

  it("reads the share still held when some was sold", () => {
    const r = keepRate([row({ measured7dRaw: 3_250_000n })], 7, T0 + 8 * DAY);
    expect(r.ok && r.value.bps).toBe(5_000);
  });

  it("is capped by the balance across ALL of a person's receipts in an asset, never per receipt", () => {
    // Two receipts of 0.065 each; the person holds 0.065 total. Naively each receipt would
    // read as fully held (0.065 ≥ 0.065) — the group cap makes it 50%.
    const rows = [
      row({ measured7dRaw: 6_500_000n }),
      row({ settledUnix: T0 + DAY, measured7dRaw: 6_500_000n }),
    ];
    const r = keepRate(rows, 7, T0 + 9 * DAY);
    expect(r.ok && r.value.bps).toBe(5_000);
  });

  it("never exceeds 100% when a balance is larger than what was delivered", () => {
    // The person bought more elsewhere. Their receipts are still fully held, no more.
    const r = keepRate([row({ measured7dRaw: 99_000_000n })], 7, T0 + 8 * DAY);
    expect(r.ok && r.value.bps).toBe(10_000);
  });

  it("weights by dollars paid, not by units, across assets with different prices", () => {
    const rows = [
      row({ measured7dRaw: 6_500_000n }), // $50 of SPYx, all held
      row({ recipient: "carol", asset: "GOLD", paidUsdc: 150_000_000n, amountRaw: 35_000n, measured7dRaw: 0n }), // $150 of GOLD, all sold
    ];
    const r = keepRate(rows, 7, T0 + 8 * DAY);
    expect(r.ok && r.value.bps).toBe(2_500); // $50 of $200
    expect(r.ok && r.value.recipients).toBe(2);
  });

  it("uses the 30-day column for the 30-day window", () => {
    const r = keepRate([row({ measured7dRaw: 0n, measured30dRaw: 6_500_000n })], 30, T0 + 31 * DAY);
    expect(r.ok && r.value.bps).toBe(10_000);
  });
});

describe("dueForMeasurement", () => {
  it("lists matured, unmeasured receipts and nothing else", () => {
    const rows = [
      row(), // matured, unmeasured → due
      row({ recipient: "bob", measured7dRaw: 1n }), // measured → not due
      row({ recipient: "carol", settledUnix: T0 + 5 * DAY }), // too young → not due
    ];
    expect(dueForMeasurement(rows, 7, T0 + 8 * DAY).map((r) => r.recipient)).toEqual(["alice"]);
    expect(dueForMeasurement(rows, 30, T0 + 8 * DAY)).toEqual([]);
  });
});
