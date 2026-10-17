import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { ASSETS, assetByFeedId, assetByMint, assetBySymbol, defaultAsset, multiplierMints, ruleAssets } from "./registry";

describe("the registry", () => {
  it("has no duplicate mints, symbols or feed ids", () => {
    expect(new Set(ASSETS.map((a) => a.mint)).size).toBe(ASSETS.length);
    expect(new Set(ASSETS.map((a) => a.symbol)).size).toBe(ASSETS.length);
    const feeds = ASSETS.flatMap((a) => [a.feedRaw?.feedId, a.feedAdjusted?.feedId]).filter(Boolean);
    expect(new Set(feeds).size).toBe(feeds.length);
  });

  it("every mint is a valid address and every feed id is 32 bytes of hex", () => {
    for (const a of ASSETS) {
      expect(() => new PublicKey(a.mint)).not.toThrow();
      for (const f of [a.feedRaw, a.feedAdjusted]) {
        if (!f) continue;
        expect(f.feedId).toMatch(/^[0-9a-f]{64}$/);
        if (f.account) expect(() => new PublicKey(f.account)).not.toThrow();
      }
    }
  });

  it("every xStock says what the issuer can do, on its own row", () => {
    for (const a of ASSETS.filter((x) => x.issuer.name.includes("xStocks"))) {
      expect(a.program).toBe("token-2022");
      expect(a.decimals).toBe(8);
      expect(a.powers.permanentDelegate).toBe(true);
      expect(a.powers.pausable).toBe(true);
      expect(a.powers.hasMultiplier).toBe(true);
      expect(a.disclosure).toMatch(/permanent delegate/);
      expect(a.disclosure).toMatch(/reinvested/);
      expect(a.feedAdjusted).not.toBeNull();
    }
  });

  it("gold is a plain SPL mint with no issuer powers, and its row says so", () => {
    const gold = assetBySymbol("GOLD")!;
    expect(gold.program).toBe("spl-token");
    expect(gold.powers).toEqual({
      permanentDelegate: false,
      pausable: false,
      freezeAuthority: false,
      transferHook: "none",
      transferFee: false,
      hasMultiplier: false,
    });
    expect(gold.disclosure).toMatch(/no freeze authority/);
    expect(gold.unit).toBe("troy-ounce");
  });

  it("every rule asset has a raw feed, and the default is an index, the Nasdaq 100", () => {
    for (const a of ruleAssets()) expect(a.feedRaw, a.symbol).not.toBeNull();
    expect(defaultAsset().symbol).toBe("QQQx");
    expect(defaultAsset().singleName).toBe(false);
  });

  it("single names are choices, never defaults, and the two indexes are not single names", () => {
    expect(assetBySymbol("SPYx")!.singleName).toBe(false);
    expect(assetBySymbol("QQQx")!.singleName).toBe(false);
    expect(assetBySymbol("NVDAx")!.singleName).toBe(true);
  });

  it("resolves an asset from either of its feeds, with the basis", () => {
    const spyx = assetBySymbol("SPYx")!;
    expect(assetByFeedId(spyx.feedRaw!.feedId)).toEqual({ asset: spyx, basis: "raw" });
    expect(assetByFeedId(spyx.feedAdjusted!.feedId)).toEqual({ asset: spyx, basis: "adjusted" });
    expect(assetByFeedId("00".repeat(32))).toBeUndefined();
  });

  it("the multiplier watcher covers exactly the mints that rebase", () => {
    expect(multiplierMints().map((a) => a.symbol)).not.toContain("GOLD");
    expect(multiplierMints().map((a) => a.symbol)).not.toContain("USDC");
    expect(multiplierMints().length).toBe(ASSETS.filter((a) => a.issuer.name.includes("xStocks")).length);
  });

  it("looks up by mint", () => {
    expect(assetByMint("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W")?.symbol).toBe("SPYx");
    expect(assetByMint("nope")).toBeUndefined();
  });
});

import { offeredAssets as offered, ruleAssets as rules } from "./registry";

describe("what the rule page offers", () => {
  it("leaves out only the stocks with no fresh on-chain price", () => {
    const left = rules().filter((a) => !offered().includes(a)).map((a) => a.symbol).sort();
    // MSFTx and MSTRx since 17 Oct 2026: their 24/7 token feeds are 25–35 days stale on chain and
    // their share feeds are not in the key's entitlement, so an automatic save could never settle.
    expect(left).toEqual(["COINx", "CRCLx", "HOODx", "MSFTx", "MSTRx"]);
  });
  it("pins the 24/7 token feed for every stock Pyth keeps fresh around the clock", () => {
    const always = ["SPYx", "QQQx", "NVDAx", "GOOGLx", "TSLAx", "METAx", "AAPLx", "AMZNx"];
    for (const sym of always) {
      const a = offered().find((x) => x.symbol === sym);
      expect(a?.feedRaw?.account, `${sym} pins its Crypto.${sym.toUpperCase()}/USD account`).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    }
  });
  it("offers every stock whose share price is pinned, and the index and the metal", () => {
    for (const a of offered()) expect(Boolean(a.feedAdjusted?.account || a.feedRaw?.account), `${a.symbol} has a pinned price account`).toBe(true);
  });
});
