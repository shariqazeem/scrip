/**
 * THE LIVE VIEW'S SHAPE — plain JSON, shared by the server that assembles it and the client
 * that polls it. No bigint: every amount is a decimal string.
 */
export type RuleState = "on" | "paused" | "delegate-replaced" | "allowance-exhausted" | "float-empty" | "no-usdc-account" | "off";

export type LiveArrival = {
  readonly id: string;
  readonly sig: string;
  readonly kind: "sweep" | "pay" | "gift" | "grant" | "vest";
  readonly basisUsdc: string;
  readonly paidUsdc: string;
  readonly rateBps: number;
  readonly amountRaw: string;
  readonly asset: string;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly settledUnix: number;
  readonly reason: string;
  readonly payer: string;
  readonly measured7dAt: number;
  readonly measured7dRaw: string;
  readonly measured30dAt: number;
  readonly measured30dRaw: string;
};

export type LiveView = {
  readonly at: number;
  readonly owner: string;
  readonly handle: string | null;
  readonly state: RuleState;
  readonly ruleOn: boolean;
  readonly rateNowBps: number;
  readonly escalateBps: number;
  readonly asset: { readonly mint: string; readonly symbol: string; readonly name: string; readonly decimals: number } | null;
  /** USD per unit of the asset on Jupiter, for display; null when unknown or a stand-in. */
  readonly priceUsd: number | null;
  readonly usdc: { readonly balance: string; readonly watermark: string; readonly delegatedAmount: string };
  /** USDC above the watermark that no keeper has swept yet, or "0". */
  readonly unswept: string;
  readonly sweeps: number;
  readonly floatLamports: string;
  readonly sweepsCovered: number;
  readonly keeper: { readonly alive: boolean; readonly lastReason: string | null; readonly lastSweepAt: number | null };
  readonly arrivals: readonly LiveArrival[];
  readonly holdings: ReadonlyArray<{ readonly mint: string; readonly symbol: string; readonly decimals: number; readonly qtyRaw: string; readonly qtyAdjusted: string; readonly multiplier: string }>;
  readonly published: boolean;
  /** Grants vesting to this owner: stock in an escrow they can see, on a schedule. */
  readonly vesting: ReadonlyArray<{
    readonly pda: string;
    readonly payer: string;
    readonly payerHandle: string | null;
    readonly symbol: string;
    readonly decimals: number | null;
    readonly totalRaw: string;
    readonly releasedRaw: string;
    readonly startUnix: number;
    readonly cliffSecs: number;
    readonly durationSecs: number;
    readonly state: string;
    readonly reason: string;
  }>;
};
