import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  ASSETS,
  DEFAULT_POLICY_BPS,
  assetByMint,
  assetBySymbol,
  multiplierMints,
} from "./registry";

describe("the default mix", () => {
  it("sums to exactly 10,000 basis points", () => {
    // The program enforces this on chain too. Two places that must agree is the reason this
    // is asserted here rather than assumed.
    const total = DEFAULT_POLICY_BPS.reduce((n, l) => n + l.bps, 0);
    expect(total).toBe(10_000);
  });

  it("names only assets that exist in the registry", () => {
    for (const leg of DEFAULT_POLICY_BPS) {
      expect(assetBySymbol(leg.symbol), `${leg.symbol} is weighted but not registered`).toBeDefined();
    }
  });

  it("contains no fund share", () => {
    // THE LAW: gold is metal or it is not gold, and the same test killed silver-as-ounces.
    // A fund tracker in the default mix would put a share of SPDR Gold on the home screen
    // labelled as grams — the single easiest claim for a judge to check and disprove.
    for (const leg of DEFAULT_POLICY_BPS) {
      expect(assetBySymbol(leg.symbol)!.kind, `${leg.symbol} is a fund and cannot be a sleeve`)
        .not.toBe("fund");
    }
  });

  it("holds the metal-to-market ratio the product law expressed", () => {
    // 50 gold + 20 silver + 30 market was 70:30 metal to market. Silver failed the metal test
    // on live data, so the metal weight absorbed it rather than the ratio moving.
    const metal = DEFAULT_POLICY_BPS.filter(
      (l) => assetBySymbol(l.symbol)!.kind === "metal",
    ).reduce((n, l) => n + l.bps, 0);
    expect(metal).toBe(7000);
  });
});

describe("units are claims about what a token IS", () => {
  it("never puts a fund share in grams or ounces", () => {
    // GLDx is ~$398, which is the price of a GLD ETF share and not of an ounce at ~$4,365.
    for (const a of ASSETS) {
      if (a.kind === "fund") {
        expect(["gram", "troy-ounce"], `${a.symbol} is a fund displayed as metal`).not.toContain(
          a.unit,
        );
      }
    }
  });

  it("gives every metal a metal unit", () => {
    for (const a of ASSETS) {
      if (a.kind === "metal") expect(["gram", "troy-ounce"]).toContain(a.unit);
    }
  });
});

describe("the disclosure on every row says what is true of that mint", () => {
  /**
   * A BOOLEAN THAT THE PROSE DOES NOT MENTION IS HOW A DISCLOSURE GOES STALE — the flag gets
   * flipped when an issuer changes something, the sentence beside it does not, and the row
   * now says the opposite of the data it sits next to. This reads both.
   */
  it("mentions the permanent delegate wherever one exists", () => {
    for (const a of ASSETS) {
      if (!a.permanentDelegate) continue;
      expect(a.disclosure.toLowerCase(), `${a.symbol}`).toContain("permanent delegate");
    }
  });

  it("mentions a freeze or pause authority wherever one exists", () => {
    for (const a of ASSETS) {
      if (!a.freezable) continue;
      expect(
        /freeze|pause|frozen/i.test(a.disclosure),
        `${a.symbol} can be frozen but does not say so`,
      ).toBe(true);
    }
  });

  it("gives every asset a named issuer, a wrapper and a disclosure", () => {
    for (const a of ASSETS) {
      expect(a.issuer.name.length, a.symbol).toBeGreaterThan(0);
      expect(a.issuer.wrapper.length, a.symbol).toBeGreaterThan(0);
      expect(a.disclosure.length, a.symbol).toBeGreaterThan(40);
    }
  });
});

describe("the registry is internally consistent", () => {
  it("has unique mints and unique symbols", () => {
    expect(new Set(ASSETS.map((a) => a.mint)).size).toBe(ASSETS.length);
    expect(new Set(ASSETS.map((a) => a.symbol)).size).toBe(ASSETS.length);
  });

  it("has a real base58 mint address on every row", () => {
    // A mint address typed from memory is not a typo, it is a transfer to a stranger.
    for (const a of ASSETS) {
      expect(() => new PublicKey(a.mint), `${a.symbol} mint is not a valid pubkey`).not.toThrow();
    }
  });

  it("declares decimals in the range a mint can actually have", () => {
    for (const a of ASSETS) {
      expect(a.decimals, a.symbol).toBeGreaterThanOrEqual(0);
      expect(a.decimals, a.symbol).toBeLessThanOrEqual(9);
    }
  });

  it("only claims a multiplier on a Token-2022 mint", () => {
    // ScaledUiAmount is a Token-2022 extension. A classic SPL mint cannot carry one, so a
    // true flag on one would send the watcher looking for an extension that cannot exist.
    for (const a of ASSETS) {
      if (a.hasMultiplier) expect(a.program, a.symbol).toBe("token-2022");
    }
  });

  it("gives the watcher exactly the mints that carry a multiplier", () => {
    expect(multiplierMints().map((a) => a.symbol).sort()).toEqual(
      ASSETS.filter((a) => a.hasMultiplier).map((a) => a.symbol).sort(),
    );
    expect(multiplierMints().length).toBeGreaterThan(0);
  });

  it("looks up by mint and by symbol", () => {
    expect(assetByMint("GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A")?.symbol).toBe("GOLD");
    expect(assetBySymbol("SPYx")?.decimals).toBe(8);
    expect(assetByMint("not-a-mint")).toBeUndefined();
  });
});
