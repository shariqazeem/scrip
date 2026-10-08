import { describe, expect, it } from "vitest";
import { INVITES_PER_TX, REQUEST_ROOM_MONTHS, stillWaiting, takesRequests } from "./requests";

describe("a Plan takes requests only while its escrow can keep the offer", () => {
  const cap = 5_000_000n; // $5 a person each month

  it("takes them with at least two people's whole month in the escrow", () => {
    expect(REQUEST_ROOM_MONTHS).toBe(2);
    expect(takesRequests(10, cap)).toBe(true);
    expect(takesRequests(125, cap)).toBe(true);
  });

  it("refuses with less, as the founder's Plan read on 8 October with about $3 left", () => {
    expect(takesRequests(2.99, cap)).toBe(false);
    expect(takesRequests(9.99, cap)).toBe(false);
  });

  it("refuses when the escrow or its price could not be read", () => {
    expect(takesRequests(null, cap)).toBe(false);
    expect(takesRequests(Number.NaN, cap)).toBe(false);
  });

  it("refuses a Plan with no cap, which the program would not open", () => {
    expect(takesRequests(1_000, 0n)).toBe(false);
  });
});

describe("the requests still waiting for the sponsor", () => {
  const sponsor = "Sponsor1111111111111111111111111111111111111";
  const rows = [
    { address: "B", createdAt: 300 },
    { address: "A", createdAt: 100 },
    { address: "C", createdAt: 200 },
    { address: sponsor, createdAt: 50 },
  ];

  it("are oldest first, never the sponsor, never somebody already invited or in", () => {
    expect(stillWaiting(rows, ["C"], sponsor).map((r) => r.address)).toEqual(["A", "B"]);
  });

  it("are empty once everybody who asked is in", () => {
    expect(stillWaiting(rows, ["A", "B", "C"], sponsor)).toEqual([]);
  });

  it("go out ten to a signature", () => {
    expect(INVITES_PER_TX).toBe(10);
  });
});
