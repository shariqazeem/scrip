/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveFeeVaultPdaAddress } from "@meteora-ag/dynamic-fee-sharing-sdk";
import { validateConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { THRESHOLD_USDC, VAULT_SHARES, feeVaultAddress, scripCurveConfig } from "./preset";

describe("the Scrip Curve preset", () => {
  for (const kind of ["public", "demonstration"] as const) {
    it(`builds a ${kind} config Meteora's own validator accepts`, () => {
      const c = scripCurveConfig(kind);
      expect(() => validateConfigParameters({ ...c, leftoverReceiver: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") } as never)).not.toThrow();
      // Fees in the quote, so every claim lands in the vault's one mint.
      expect(c.collectFeeMode).toBe(0);
      expect(c.creatorTradingFeePercentage).toBe(50);
      // Migration at the threshold, in USDC base units.
      expect(c.migrationQuoteThreshold.toString()).toBe(String(THRESHOLD_USDC[kind] * 1_000_000));
      // Everything locked at graduation: nobody can pull the pool.
      expect(c.partnerPermanentLockedLiquidityPercentage + c.creatorPermanentLockedLiquidityPercentage).toBe(100);
      expect(c.partnerLiquidityPercentage + c.creatorLiquidityPercentage).toBe(0);
    });
  }

  it("splits the vault 90 to the Savings Pool and 10 to Scrip", () => {
    expect(VAULT_SHARES.savingsPool + VAULT_SHARES.scrip).toBe(10_000);
    expect(VAULT_SHARES.savingsPool / 100).toBe(90);
  });

  it("derives the vault exactly as Meteora's SDK does", () => {
    const base = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
    const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(feeVaultAddress(base, usdc).toBase58()).toBe(deriveFeeVaultPdaAddress(base, usdc).toBase58());
  });
});
