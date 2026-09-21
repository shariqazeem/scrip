import { describe, expect, it } from "vitest";
import type { LiveArrival, LiveView } from "./live-types";
import { milestonesFor, nextWholeShare } from "./milestones";

const DAY = 86_400;
function arrival(i: number, over: Partial<LiveArrival> = {}): LiveArrival {
  return {
    id: `r${i}`,
    sig: `sig${i}`,
    kind: "sweep",
    basisUsdc: "200000000",
    paidUsdc: "20000000",
    rateBps: 1000,
    amountRaw: "2000000", // 0.02 of an 8-decimal asset
    asset: "MINT",
    symbol: "SPYx",
    decimals: 8,
    settledUnix: 1_700_000_000 + i * DAY,
    reason: "",
    payer: "P",
    measured7dAt: 0,
    measured7dRaw: "0",
    measured30dAt: 0,
    measured30dRaw: "0",
    ...over,
  };
}
function view(arrivals: LiveArrival[]): LiveView {
  return {
    at: 1_700_000_000,
    owner: "O",
    handle: "amina",
    state: "on",
    ruleOn: true,
    rateNowBps: 1000,
    escalateBps: 0,
    asset: { mint: "MINT", symbol: "SPYx", name: "S&P 500", decimals: 8 },
    priceUsd: null,
    usdc: { balance: "0", watermark: "0", delegatedAmount: "0" },
    unswept: "0",
    sweeps: arrivals.length,
    floatLamports: "0",
    sweepsCovered: 0,
    keeper: { alive: true, lastReason: null, lastSweepAt: null },
    arrivals,
    holdings: [],
    published: true,
    vesting: [],
  } as unknown as LiveView;
}

describe("milestones are facts that already happened", () => {
  it("says nothing at all before the first receipt", () => {
    expect(milestonesFor(view([]))).toEqual([]);
    expect(nextWholeShare(view([]))).toBeNull();
  });
  it("names the first receipt, and dates it by that receipt", () => {
    const m = milestonesFor(view([arrival(0)]));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: "first", sig: "sig0", atUnix: 1_700_000_000 });
  });
  it("crosses a whole share on the receipt that crossed it, not the last one", () => {
    // 0.02 each: the 50th receipt reaches 1.00.
    const m = milestonesFor(view(Array.from({ length: 60 }, (_, i) => arrival(i))));
    const whole = m.find((x) => x.id === "whole-share");
    expect(whole?.sig).toBe("sig49");
    expect(m.find((x) => x.id === "ten")?.sig).toBe("sig9");
  });
  it("counts a thousand dollars from the receipts' own paid amounts", () => {
    const m = milestonesFor(view(Array.from({ length: 60 }, (_, i) => arrival(i))));
    expect(m.find((x) => x.id === "thousand")?.sig).toBe("sig49"); // $20 each
  });
  it("claims thirty days kept only when the chain measured it and the units were there", () => {
    const measured = arrival(0, { measured30dAt: 1_700_000_000 + 30 * DAY, measured30dRaw: "2000000" });
    expect(milestonesFor(view([measured])).find((m) => m.id === "thirty-days")?.atUnix).toBe(1_700_000_000 + 30 * DAY);
    const spent = arrival(0, { measured30dAt: 1_700_000_000 + 30 * DAY, measured30dRaw: "1" });
    expect(milestonesFor(view([spent])).find((m) => m.id === "thirty-days")).toBeUndefined();
    const unmeasured = arrival(0);
    expect(milestonesFor(view([unmeasured])).find((m) => m.id === "thirty-days")).toBeUndefined();
  });
  it("is ordered by when each was crossed", () => {
    const m = milestonesFor(view(Array.from({ length: 60 }, (_, i) => arrival(i))));
    expect(m.map((x) => x.atUnix)).toEqual([...m.map((x) => x.atUnix)].sort((a, b) => a - b));
  });
});

describe("the next whole share is arithmetic, never a forecast", () => {
  it("counts arrivals at this register's own average", () => {
    const n = nextWholeShare(view(Array.from({ length: 10 }, (_, i) => arrival(i))));
    // 10 × 0.02 = 0.20 held; 0.80 missing at 0.02 each = 40 arrivals.
    expect(n?.line).toContain("About 40 more arrivals");
    expect(n?.line).toContain("first whole SPYx");
    expect(n?.sub).toContain("Not a forecast");
  });
  it("counts the share after the ones already whole", () => {
    const n = nextWholeShare(view(Array.from({ length: 50 }, (_, i) => arrival(i))));
    expect(n?.line).toContain("second whole SPYx");
  });
  it("says one more arrival when one would do it", () => {
    const n = nextWholeShare(view([arrival(0, { amountRaw: "99000000" })])); // 0.99
    expect(n?.line).toContain("The next arrival");
  });
  it("says nothing when the asset is a stand-in with no decimals", () => {
    const v = { ...view([arrival(0)]), asset: { mint: "MINT", symbol: "?", name: "?", decimals: null } } as unknown as LiveView;
    expect(nextWholeShare(v)).toBeNull();
  });
});
