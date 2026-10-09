/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveTokenBadgeAddress, validateConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { deriveTokenBadgeAddress as deriveDammBadge } from "@meteora-ag/cp-amm-sdk";
import { CURVE_QUOTE, CURVE_QUOTE_MINT, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, PRESET, THRESHOLD_QUOTE, scripCurveConfig, tokenBadge } from "./preset";

describe("the Scrip Curve preset, priced in the Nasdaq 100", () => {
  for (const kind of ["public", "demonstration"] as const) {
    it(`builds a ${kind} config Meteora's own validator accepts`, () => {
      const c = scripCurveConfig(kind);
      expect(() => validateConfigParameters({ ...c, leftoverReceiver: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") } as never)).not.toThrow();
      // Fees in the quote, so every claim is Nasdaq 100, the one thing a Plan pays.
      expect(c.collectFeeMode).toBe(0);
      expect(c.creatorTradingFeePercentage).toBe(PRESET.creatorTradingFeePercentage[kind]);
      // Migration at the threshold, in Nasdaq 100 base units (8 decimals).
      expect(c.migrationQuoteThreshold.toString()).toBe(String(Math.round(THRESHOLD_QUOTE[kind] * 10 ** CURVE_QUOTE.decimals)));
      // Everything locked at graduation: nobody can pull the pool.
      expect(c.partnerPermanentLockedLiquidityPercentage + c.creatorPermanentLockedLiquidityPercentage).toBe(100);
      expect(c.partnerLiquidityPercentage + c.creatorLiquidityPercentage).toBe(0);
    });
  }

  it("gives a demonstration's whole partner-side fee to savers, none to whoever launched it", () => {
    expect(scripCurveConfig("demonstration").creatorTradingFeePercentage).toBe(0);
    expect(PRESET.migrationCreatorFeePercentage.demonstration).toBe(0);
  });

  it("is quoted in the registry's Nasdaq 100", () => {
    expect(CURVE_QUOTE.symbol).toBe("QQQx");
    expect(CURVE_QUOTE.program).toBe("token-2022");
    expect(CURVE_QUOTE.decimals).toBe(8);
  });

  it("derives Meteora's token badges exactly as Meteora's SDKs do", () => {
    expect(tokenBadge(DBC_PROGRAM_ID, CURVE_QUOTE_MINT).toBase58()).toBe(deriveTokenBadgeAddress(CURVE_QUOTE_MINT).toBase58());
    expect(tokenBadge(DAMM_V2_PROGRAM_ID, CURVE_QUOTE_MINT).toBase58()).toBe(deriveDammBadge(CURVE_QUOTE_MINT).toBase58());
  });
});
