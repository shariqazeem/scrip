import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { TEAM, TESTERS, isStranger, isTeam, outsideTeam, walletTag } from "./team";

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
    expect(outsideTeam(rows)).toEqual({ receipts: 3, wallets: 2, testerReceipts: 0, testers: 0 });
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

describe("who counts as someone Scrip reached", () => {
  const STRANGER = "64fcNUtAAockLpMJZ1DudHCMHJhLRBmgrmGvbrwmQzQw";
  const TEAM_WALLET = [...TEAM.keys()][0]!;

  it("is never the team, and never a paid tester", () => {
    expect(isStranger(STRANGER)).toBe(true);
    expect(isStranger(TEAM_WALLET)).toBe(false);
    for (const tester of TESTERS.keys()) expect(isStranger(tester)).toBe(false);
    expect(isStranger(null)).toBe(false);
  });

  it("tags the team's stubs, and leaves a stranger's unmarked", () => {
    expect(walletTag(TEAM_WALLET)).toBe("team");
    expect(walletTag(STRANGER)).toBeUndefined();
  });

  it("lists paid testers as real addresses, never also on the team", () => {
    for (const a of TESTERS.keys()) {
      expect(() => new PublicKey(a)).not.toThrow();
      expect(TEAM.has(a)).toBe(false);
    }
  });
});
