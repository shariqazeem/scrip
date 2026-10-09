import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  type ConfigParameters,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PublicKey } from "@solana/web3.js";
import { assetBySymbol } from "@/lib/assets/registry";

/**
 * SCRIP CURVE — a Dynamic Bonding Curve preset priced in the Nasdaq 100, whose fees match savers.
 *
 * A launch on this config is a stock-pair: its quote token is the Nasdaq 100 (xStocks QQQx), so
 * every buy pays in stock and every trading fee is stock. The config's fee claimer is Scrip's
 * saving service, and its only use of that is to claim the partner fees TO a Scrip Plan: Meteora's
 * own `claim_trading_fee` with the Plan as the receiver moves them from the curve's vault straight
 * into the Plan's escrow (the Plan's own Nasdaq 100 account), never through a wallet. The Plan,
 * enforced by Scrip's program, matches every member's automatic save from that escrow. At
 * graduation the pool moves to DAMM v2 as launch token / Nasdaq 100, all liquidity locked, and the
 * locked partner position's fees are claimed to the same Plan with `claim_position_fee` the same way.
 *
 * Why each number is what it is:
 *
 *   quote QQQx            Meteora has created token badges for QQQx in both DBC and DAMM v2 (read
 *                         on mainnet, 9 October), so a Nasdaq 100 quote is permissionless; and a
 *                         Plan's escrow holds the same stock, so a fee needs no swap to match a saver
 *   fees in the quote     collect-fee mode QuoteToken on the curve and after migration: every fee
 *                         is Nasdaq 100, the one thing a Plan can pay
 *   a decaying fee        starts at 25% and falls to 1% over the first hour: a sniper pays the
 *                         savers, a holder does not
 *   creator share         none on a demonstration (every fee goes to savers, none to whoever
 *                         launched it); half on the public preset, so a launcher has a reason to
 *   all liquidity locked  partner and creator positions locked for good at graduation: nobody can
 *                         pull the pool, and the locked partner position keeps paying the Plan
 *   immutable token       nobody can mint more or change the metadata after launch
 *
 * Meteora's Dynamic Fee Sharing vault is not used: it accepts only plain mints and refuses an
 * xStock's permanent delegate. The receiver-claim does the same job with fewer moving parts.
 * Nothing here makes a claim about a launch's price; only about its fees.
 */

export const DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
export const DAMM_V2_PROGRAM_ID = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
/** Meteora's DAMM v2 config for a customizable migrated-pool fee (the SDK's last migration address). */
export const DAMM_V2_CUSTOMIZABLE_CONFIG = new PublicKey("A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck");

/** The quote: the Nasdaq 100, as the registry and every Plan on it know it. */
export const CURVE_QUOTE = (() => {
  const a = assetBySymbol("QQQx");
  if (!a) throw new Error("the registry has no QQQx");
  return a;
})();
export const CURVE_QUOTE_MINT = new PublicKey(CURVE_QUOTE.mint);
export const CURVE_QUOTE_DECIMALS = CURVE_QUOTE.decimals;

/** Meteora's token badge for a mint, in either program: `["token_badge", mint]`. */
export function tokenBadge(program: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("token_badge"), mint.toBuffer()], program)[0];
}

export type CurveKind = "public" | "demonstration";

/** Where a curve graduates, in Nasdaq 100 units (not dollars, not raw). */
export const THRESHOLD_QUOTE: Readonly<Record<CurveKind, number>> = {
  /** About $750 of Nasdaq 100 at October 2026 prices: a real launch's raise. */
  public: 1,
  /** About $30: low enough to graduate with one real buy after the fee has fallen. */
  demonstration: 0.04,
};

export const PRESET = {
  totalSupply: 1_000_000_000,
  startingFeeBps: 2_500,
  endingFeeBps: 100,
  feeDecaySeconds: 3_600,
  feePeriods: 60,
  /** Of the partner-side trading fee, what the launcher keeps. None on a demonstration. */
  creatorTradingFeePercentage: { public: 50, demonstration: 0 } as Readonly<Record<CurveKind, number>>,
  /** Of the quote at migration: a fee split between partner (the Plan) and creator. */
  migrationFeePercentage: 2,
  migrationCreatorFeePercentage: { public: 50, demonstration: 0 } as Readonly<Record<CurveKind, number>>,
  migratedPoolFeeBps: 100,
  percentageSupplyOnMigration: 20,
} as const;

/** The config parameters for a Scrip Curve launch config. Pure: the same inputs, the same config. */
export function scripCurveConfig(kind: CurveKind): ConfigParameters {
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: CURVE_QUOTE_DECIMALS,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: PRESET.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: {
          startingFeeBps: PRESET.startingFeeBps,
          endingFeeBps: PRESET.endingFeeBps,
          numberOfPeriod: PRESET.feePeriods,
          totalDuration: PRESET.feeDecaySeconds,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: PRESET.creatorTradingFeePercentage[kind],
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: true,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: PRESET.migrationFeePercentage, creatorFeePercentage: PRESET.migrationCreatorFeePercentage[kind] },
      migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Enabled, poolFeeBps: PRESET.migratedPoolFeeBps },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 50,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: PRESET.percentageSupplyOnMigration,
    migrationQuoteThreshold: THRESHOLD_QUOTE[kind],
  });
}
