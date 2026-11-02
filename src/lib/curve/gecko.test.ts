import { afterEach, describe, expect, it, vi } from "vitest";
import { liveChartFor } from "./gecko";

/** GeckoTerminal's API as a map of pool → status; anything else throws, as a network failure would. */
function gecko(statuses: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const pool = url.split("/").pop()!;
      const status = statuses[pool];
      if (status === undefined) throw new Error("offline");
      return new Response("{}", { status });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("liveChartFor", () => {
  it("links the graduated pool when GeckoTerminal lists it", async () => {
    gecko({ dammA: 200, curveA: 200 });
    expect(await liveChartFor({ pool: "curveA", dammPool: "dammA", migrated: true })).toBe("https://www.geckoterminal.com/solana/pools/dammA");
  });

  it("falls back to the curve when the graduated pool is not listed", async () => {
    gecko({ dammB: 404, curveB: 200 });
    expect(await liveChartFor({ pool: "curveB", dammPool: "dammB", migrated: true })).toBe("https://www.geckoterminal.com/solana/pools/curveB");
  });

  it("links nothing for a launch GeckoTerminal has not listed, as before its first trade", async () => {
    gecko({ curveC: 404 });
    expect(await liveChartFor({ pool: "curveC", dammPool: null, migrated: false })).toBeNull();
  });

  it("links nothing when GeckoTerminal cannot be asked, and asks again next time", async () => {
    gecko({});
    expect(await liveChartFor({ pool: "curveD", dammPool: null, migrated: false })).toBeNull();
    gecko({ curveD: 200 });
    expect(await liveChartFor({ pool: "curveD", dammPool: null, migrated: false })).toBe("https://www.geckoterminal.com/solana/pools/curveD");
  });
});
