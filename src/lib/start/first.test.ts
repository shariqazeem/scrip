import { describe, expect, it } from "vitest";
import { FIRST_SLICE_MAX_USDC, firstPayment, sliceOf } from "./first";

const NOW = 1_791_500_000;
const pay = (usd: number, daysAgo = 1, sig = `sig${usd}`) => ({ sig, at: NOW - daysAgo * 86_400, usdc: BigInt(Math.round(usd * 1e6)), from: "payer" });
const usd = (n: number) => BigInt(Math.round(n * 1e6));

describe("the first payment a start saves", () => {
  it("starts with the latest payment, at the program's own arithmetic", () => {
    const f = firstPayment({ inflows: [pay(20, 3, "older"), pay(10.1, 1, "latest")], usdcBalance: usd(30), rateBps: 1_000, nowUnix: NOW });
    expect(f).toEqual({ basisUsdc: usd(10.1), sliceUsdc: usd(1.01), payment: { sig: "latest", at: NOW - 86_400, usdc: usd(10.1) }, capped: false });
  });

  it("counts only what the wallet still holds of that payment", () => {
    const f = firstPayment({ inflows: [pay(250)], usdcBalance: usd(40), rateBps: 1_000, nowUnix: NOW });
    expect(f?.basisUsdc).toBe(usd(40));
    expect(f?.sliceUsdc).toBe(usd(4));
    expect(f?.payment?.usdc).toBe(usd(250));
  });

  it("takes at most $50, so the $200 limit has room for the next payments", () => {
    const f = firstPayment({ inflows: [pay(2_000)], usdcBalance: usd(2_000), rateBps: 1_000, nowUnix: NOW });
    expect(f?.capped).toBe(true);
    expect(f?.basisUsdc).toBe(usd(500));
    expect(f?.sliceUsdc).toBe(FIRST_SLICE_MAX_USDC);
    const twenty = firstPayment({ inflows: [pay(2_000)], usdcBalance: usd(2_000), rateBps: 2_000, nowUnix: NOW });
    expect(twenty?.basisUsdc).toBe(usd(250));
    expect(twenty?.sliceUsdc).toBe(FIRST_SLICE_MAX_USDC);
  });

  it("falls back to the USDC the wallet holds when it was not paid lately", () => {
    const none = firstPayment({ inflows: [], usdcBalance: usd(20), rateBps: 1_000, nowUnix: NOW });
    expect(none).toEqual({ basisUsdc: usd(20), sliceUsdc: usd(2), payment: null, capped: false });
    const stale = firstPayment({ inflows: [pay(80, 45)], usdcBalance: usd(20), rateBps: 1_000, nowUnix: NOW });
    expect(stale?.payment).toBeNull();
  });

  it("uses the balance when the last payment's slice is under the program's minimum", () => {
    const f = firstPayment({ inflows: [pay(3)], usdcBalance: usd(50), rateBps: 1_000, nowUnix: NOW });
    expect(f?.payment).toBeNull();
    expect(f?.sliceUsdc).toBe(usd(5));
  });

  it("offers nothing the program would refuse", () => {
    // 10% of $4.99 is under the $0.50 minimum slice.
    expect(firstPayment({ inflows: [pay(4.99)], usdcBalance: usd(4.99), rateBps: 1_000, nowUnix: NOW })).toBeNull();
    expect(firstPayment({ inflows: [], usdcBalance: 0n, rateBps: 1_000, nowUnix: NOW })).toBeNull();
    // At 20%, $2.50 reaches it.
    expect(firstPayment({ inflows: [], usdcBalance: usd(2.5), rateBps: 2_000, nowUnix: NOW })?.sliceUsdc).toBe(usd(0.5));
  });

  it("matches compute_slice: floor, never a rounded-up cent", () => {
    expect(sliceOf(usd(137.43), 1_000)).toBe(13_743_000n);
    expect(sliceOf(1_234_567n, 1_000)).toBe(123_456n);
    expect(sliceOf(usd(9_000), 1_000)).toBe(usd(500)); // the $5,000 cap per payment
  });
});
