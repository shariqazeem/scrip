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
import { type Asset, assetBySymbol } from "@/lib/assets/registry";

/**
 * SCRIP CURVE — Dynamic Bonding Curve presets priced in a stock, whose fees match savers.
 *
 * A launch on one of these configs is a stock-pair: its quote token is a tokenized stock (the
 * Nasdaq 100, the S&P 500, Tesla or Nvidia, all xStocks), so every buy pays in stock and every
 * trading fee is stock. Each config's fee claimer is Scrip's saving service, and its only use of
 * that is to claim the partner fees TO a Scrip Plan in the same stock: Meteora's own
 * `claim_trading_fee` with the Plan as the receiver moves them from the curve's vault straight
 * into the Plan's escrow (the Plan's own account in that stock), never through a wallet. The
 * Plan, enforced by Scrip's program, matches every member's automatic save from that escrow. At
 * graduation the pool moves to DAMM v2 as launch token / stock, all liquidity locked, and the
 * locked partner position's fees are claimed to the same Plan with `claim_position_fee`.
 *
 * Why each number is what it is:
 *
 *   four stocks           Meteora has created token badges for QQQx, SPYx, TSLAx and NVDAx in both
 *                         DBC and DAMM v2 (read on mainnet, 10 October), so each quote is
 *                         permissionless; and a Plan's escrow holds the same stock, so a fee needs
 *                         no swap to match a saver
 *   fees in the quote     collect-fee mode QuoteToken on the curve and after migration: every fee
 *                         is the stock, the one thing that stock's Plan pays
 *   a decaying fee        starts at 25% and falls to 1% over the first hour: a sniper pays the
 *                         savers, a holder does not
 *   creator share         half on the public preset, so a launcher has a reason to; none on a
 *                         demonstration (every fee goes to savers, none to whoever launched it)
 *   graduation            about $850 of the stock on the public preset, above the $750 Meteora's
 *                         own migration keepers need for a stock quote, so Meteora graduates a full
 *                         curve by itself; about $15 on a demonstration, graduated by hand
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

/** The stocks a launch can be priced in, each badged by Meteora for DBC and DAMM v2. */
export const CURVE_STOCKS = ["QQQx", "SPYx", "TSLAx", "NVDAx"] as const;
export type CurveStock = (typeof CURVE_STOCKS)[number];

export function isCurveStock(s: unknown): s is CurveStock {
  return typeof s === "string" && (CURVE_STOCKS as readonly string[]).includes(s);
}

/** A curve stock, as the registry and every Plan on it know it. */
export function curveQuote(stock: CurveStock): Asset {
  const a = assetBySymbol(stock);
  if (!a) throw new Error(`the registry has no ${stock}`);
  return a;
}

/** Which curve stock a mint is, if any. */
export function curveStockOfMint(mint: string): CurveStock | null {
  return CURVE_STOCKS.find((s) => curveQuote(s).mint === mint) ?? null;
}

/** The Nasdaq 100: the default, and a demonstration's quote. */
export const CURVE_QUOTE = curveQuote("QQQx");
export const CURVE_QUOTE_MINT = new PublicKey(CURVE_QUOTE.mint);
export const CURVE_QUOTE_DECIMALS = CURVE_QUOTE.decimals;

/** Meteora's token badge for a mint, in either program: `["token_badge", mint]`. */
export function tokenBadge(program: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("token_badge"), mint.toBuffer()], program)[0];
}

export type CurveKind = "public" | "demonstration";

/**
 * Where a curve graduates, in units of its stock (not dollars, not raw), set from Jupiter's
 * prices on 10 October 2026: QQQx $752.17, SPYx $778.90, TSLAx $382.53, NVDAx $230.01.
 */
export const THRESHOLD: Readonly<Record<CurveKind, Readonly<Record<CurveStock, number>>>> = {
  /** About $850: above the $750 Meteora's keepers need to graduate a stock-quoted curve themselves. */
  public: { QQQx: 1.15, SPYx: 1.1, TSLAx: 2.25, NVDAx: 3.75 },
  /** About $15: low enough for the founder's own buys to fill and graduate it. */
  demonstration: { QQQx: 0.02, SPYx: 0.02, TSLAx: 0.04, NVDAx: 0.065 },
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

/** The trading fee, in basis points, `seconds` after a launch: 25% falling to 1% in 60 one-minute steps. */
export function feeBpsAt(seconds: number): number {
  if (seconds < 0) return PRESET.startingFeeBps;
  const period = Math.min(PRESET.feePeriods, Math.floor(seconds / (PRESET.feeDecaySeconds / PRESET.feePeriods)));
  const r = Math.pow(PRESET.endingFeeBps / PRESET.startingFeeBps, 1 / PRESET.feePeriods);
  return Math.max(PRESET.endingFeeBps, PRESET.startingFeeBps * Math.pow(r, period));
}

/** The config parameters for a Scrip Curve launch config. Pure: the same inputs, the same config. */
export function scripCurveConfig(kind: CurveKind, stock: CurveStock = "QQQx"): ConfigParameters {
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: curveQuote(stock).decimals,
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
    migrationQuoteThreshold: THRESHOLD[kind][stock],
  });
}
