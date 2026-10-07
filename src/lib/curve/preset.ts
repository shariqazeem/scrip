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

/**
 * SCRIP CURVE — a Dynamic Bonding Curve preset whose fees become savings.
 *
 * Every launch on this config sends its partner share of trading fees, its migration fee and,
 * after graduation, the fees of its permanently locked partner position to one Dynamic Fee
 * Sharing vault, because that vault is the config's fee claimer. The vault splits what it
 * receives between the Savings Pool (90) and Scrip (10); the Savings Pool turns its share into
 * stock in savers' wallets, each payment on a receipt that names the launch.
 *
 * Why each number is what it is:
 *
 *   quote USDC            the vault takes one plain mint; xStocks carry extensions it refuses
 *   fees in the quote     collect-fee mode QuoteToken on the curve and after migration, so every
 *                         claim lands in the vault's one mint
 *   a decaying fee        starts at 25% and falls to 1% over the first hour: a sniper pays the
 *                         savers, a holder does not
 *   creator 50%           the launcher keeps half of the partner-side trading fee
 *   all liquidity locked  partner and creator positions locked for good at graduation: nobody
 *                         can pull the pool, and the locked partner position keeps paying fees
 *   immutable token       nobody can mint more or change the metadata after launch
 *   750 USDC              the quote at which Meteora's own keepers migrate a USDC pool
 *
 * A demonstration launch uses the same preset with a low threshold, graduated with Meteora's
 * manual migrator. Nothing here makes a claim about a launch's price; only about its fees.
 */

export const DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
export const DAMM_V2_PROGRAM_ID = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
export const DFS_PROGRAM_ID = new PublicKey("dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh");
/** Meteora's DAMM v2 config for a customizable migrated-pool fee (the SDK's last migration address). */
export const DAMM_V2_CUSTOMIZABLE_CONFIG = new PublicKey("A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck");

/** The two recipients of the vault, in basis points of its shares. Fixed for the vault's life. */
export const VAULT_SHARES = { savingsPool: 9_000, scrip: 1_000 } as const;

export type CurveKind = "public" | "demonstration";

export const THRESHOLD_USDC: Readonly<Record<CurveKind, number>> = {
  /** Meteora's keepers migrate a USDC pool at 750. */
  public: 750,
  /** Low enough to graduate with one real buy, through the manual migrator. */
  demonstration: 30,
};

export const PRESET = {
  totalSupply: 1_000_000_000,
  startingFeeBps: 2_500,
  endingFeeBps: 100,
  feeDecaySeconds: 3_600,
  feePeriods: 60,
  creatorTradingFeePercentage: 50,
  /** Of the quote at migration: a fee split between partner (the vault) and creator. */
  migrationFeePercentage: 2,
  migrationCreatorFeePercentage: 50,
  migratedPoolFeeBps: 100,
  percentageSupplyOnMigration: 20,
} as const;

/** The config parameters for a Scrip Curve launch config. Pure: the same inputs, the same config. */
export function scripCurveConfig(kind: CurveKind): ConfigParameters {
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: 6,
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
      creatorTradingFeePercentage: PRESET.creatorTradingFeePercentage,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: true,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: PRESET.migrationFeePercentage, creatorFeePercentage: PRESET.migrationCreatorFeePercentage },
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
    migrationQuoteThreshold: THRESHOLD_USDC[kind],
  });
}

/** The fee-sharing vault's PDA, under Meteora's program: `["fee_vault", base, token_mint]`. */
export function feeVaultAddress(base: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("fee_vault"), base.toBuffer(), mint.toBuffer()], DFS_PROGRAM_ID)[0];
}
