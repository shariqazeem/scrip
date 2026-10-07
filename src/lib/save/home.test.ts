// @vitest-environment node
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receipts, saves } from "@/lib/db/schema";
import { listOf } from "./card";
import { catalogue } from "./catalogue";
import { type StockHolding, worthOf } from "./holdings";
import { savingsTotals } from "./totals";

const OWNER = "Cpv8gA7SDZ9RWDomYbna6jK2uEjFSaTJmSo6vmix9g2k";
const OTHER = "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5";
const QQQX = "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ";

function receipt(n: number, kind: string, recipient: string, paidUsdc: number, settledUnix: number) {
  return {
    id: `receipt${n}`,
    pda: `pda${n}`,
    sig: `sig${n}`,
    kind,
    recipient,
    submitter: "keeper",
    book: "book",
    releaseId: `r${n}`,
    reasonHash: "",
    basisUsdc: paidUsdc * 10,
    rateBps: 1000,
    paidUsdc,
    asset: QQQX,
    amountRaw: 1000 + n,
    settledSlot: n,
    settledUnix,
  };
}

describe("what your savings screen sums", () => {
  it("counts what the person saved, by hand and automatically, apart from what was added for them", async () => {
    await db.insert(saves).values([
      { sig: "save1", owner: OWNER, mint: QQQX, paidUsdc: 5_000_000, amountRaw: 6_000, settledSlot: 10, settledUnix: 1_759_900_000 },
      { sig: "save2", owner: OWNER, mint: QQQX, paidUsdc: 10_000_000, amountRaw: 12_000, settledSlot: 20, settledUnix: 1_759_800_000 },
      { sig: "save3", owner: OTHER, mint: QQQX, paidUsdc: 99_000_000, amountRaw: 1, settledSlot: 30, settledUnix: 1_759_000_000 },
    ]);
    await db.insert(receipts).values([
      receipt(1, "sweep", OWNER, 2_500_000, 1_759_950_000),
      receipt(2, "pay", OWNER, 4_000_000, 1_759_960_000),
      receipt(3, "gift", OWNER, 1_000_000, 1_759_970_000),
      // A grant's purchase is the escrow being bought, not a delivery: never "added".
      receipt(4, "grant", OWNER, 50_000_000, 1_759_980_000),
      receipt(5, "vest", OWNER, 500_000, 1_759_990_000),
      receipt(6, "sweep", OTHER, 7_000_000, 1_759_000_000),
    ]);
    const t = await savingsTotals(OWNER);
    expect(t.savedUsdc).toBe(17_500_000n); // $5 + $10 by hand, $2.50 automatically
    expect(t.addedUsdc).toBe(5_500_000n); // pay + gift + vest, never the grant's purchase
    expect(t.saves).toBe(2);
    expect(t.automatic).toBe(1);
    expect(t.added).toBe(3);
    // The first save is the earliest of either kind: here the $10 by hand.
    expect(t.first).toEqual({ sig: "save2", paidUsdc: 10_000_000n, mint: QQQX, unix: 1_759_800_000 });
  });

  it("is all zero, with no first save, for a wallet that has never saved", async () => {
    const t = await savingsTotals("11111111111111111111111111111111");
    expect(t).toEqual({ savedUsdc: 0n, addedUsdc: 0n, saves: 0, automatic: 0, added: 0, first: null });
  });
});

describe("worth today", () => {
  const stock = catalogue()[0]!;
  const row = (usdValue: number | null): StockHolding => ({ stock, raw: 1n, usdPrice: usdValue, usdValue });
  it("sums what has a price and counts what has none, never treating a missing price as zero worth", () => {
    expect(worthOf([row(12.5), row(null), row(0.25)])).toEqual({ usd: 12.75, unpriced: 1 });
    expect(worthOf([])).toEqual({ usd: 0, unpriced: 0 });
  });
});

describe("listOf", () => {
  it("joins names the way a sentence does", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["Nasdaq 100"])).toBe("Nasdaq 100");
    expect(listOf(["Nasdaq 100", "Gold"])).toBe("Nasdaq 100 and Gold");
    expect(listOf(["Nasdaq 100", "Gold", "Tesla"])).toBe("Nasdaq 100, Gold and Tesla");
  });
});
