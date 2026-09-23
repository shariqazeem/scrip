import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { TEAM, isTeam, outsideTeam } from "./team";

describe("the team's wallets", () => {
  it("are all real addresses", () => {
    for (const a of TEAM.keys()) expect(() => new PublicKey(a)).not.toThrow();
  });
  it("count only the others as people reached", () => {
    const rows = [
      { recipient: "BbDN31Q4qK53ddNuJnvpvWfC5UFMi87HGxQmuJobUv3q" },
      { recipient: "11111111111111111111111111111112" },
      { recipient: "11111111111111111111111111111112" },
      { recipient: "SysvarRent111111111111111111111111111111111" },
    ];
    expect(outsideTeam(rows)).toEqual({ receipts: 3, wallets: 2 });
    expect(isTeam(null)).toBe(false);
    expect(isTeam("EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5")).toBe(true);
  });
});

import { MAINNET_SINCE_UNIX, mainnetDay } from "@/lib/solana/cluster";

describe("day N on mainnet", () => {
  it("is day 1 on 21 September 2026 and day 3 on the 23rd", () => {
    expect(mainnetDay(MAINNET_SINCE_UNIX, "mainnet-beta")).toBe(1);
    expect(mainnetDay(MAINNET_SINCE_UNIX + 2 * 86_400 + 3600, "mainnet-beta")).toBe(3);
  });
  it("is nothing off mainnet, or before it", () => {
    expect(mainnetDay(MAINNET_SINCE_UNIX + 86_400, "devnet")).toBeNull();
    expect(mainnetDay(MAINNET_SINCE_UNIX - 1, "mainnet-beta")).toBeNull();
  });
});
