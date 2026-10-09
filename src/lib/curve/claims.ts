import { CpAmm, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { type Connection, PublicKey, type Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { type Outcome, held, ok } from "@/lib/outcome";
import { CURVE_QUOTE, CURVE_QUOTE_MINT } from "./preset";
import type { Launch } from "./deployed";

/**
 * LAUNCH FEES INTO A PLAN — the three ways a Scrip Curve launch's partner fees reach the Plan that
 * matches savers, built here once for the CLI and for Scrip's saving service.
 *
 *   on the curve       DBC `claim_trading_fee` with the Plan as the receiver: Meteora moves the
 *                      fee from the curve's quote vault into the Plan's escrow (the Plan's own
 *                      Nasdaq 100 account), in one instruction. No wallet holds it in between.
 *   after graduation   DAMM v2 `claim_position_fee` on the locked partner position, the Plan again
 *                      the receiver, so the same holds for every fee the graduated pool earns.
 *   at graduation      the partner's share of the graduation fee, which DBC pays only to the
 *                      claimer's own account: withdrawn, then moved into the escrow at once.
 *
 * The fee claimer signs each; Meteora lets it choose the receiver, and this only ever names the
 * Plan. Nothing here can send a fee anywhere else.
 */

export type FeeWaiting = {
  /** Partner fee on the curve, Nasdaq 100 base units. */
  readonly onCurve: bigint;
  /** Fee waiting on the locked partner position after graduation, Nasdaq 100 base units. */
  readonly onPosition: bigint;
  readonly migrated: boolean;
  /** The partner's graduation fee still to move into the Plan: graduated, and DBC's partner bit (0b100) unset. */
  readonly graduationFeeWaiting: boolean;
};

/** DBC's `migration_fee_withdraw_status`: bit 2 (0b100) is the partner's share, taken. */
export const PARTNER_MIGRATION_FEE_TAKEN = 0b100;

export function curveClient(conn: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(conn, "confirmed");
}

/** What a launch has waiting for the Plan, read now. */
export async function feesWaiting(conn: Connection, launch: Launch): Promise<Outcome<FeeWaiting>> {
  let state;
  try {
    state = (await curveClient(conn).state.getPool(launch.pool))?.poolState;
  } catch (err) {
    return held(`the curve could not be read (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!state) return held("no such curve");
  let onPosition = 0n;
  if (state.isMigrated && launch.dammPool && launch.partnerPosition) {
    try {
      const amm = new CpAmm(conn);
      const [pool, position] = await Promise.all([amm.fetchPoolState(new PublicKey(launch.dammPool)), amm.fetchPositionState(new PublicKey(launch.partnerPosition))]);
      const fee = getUnClaimLpFee(pool, position);
      // Fees collect in the quote only (token B), so B is the whole of it.
      onPosition = BigInt(fee.feeTokenB.toString());
    } catch {
      onPosition = 0n;
    }
  }
  const migrated = Boolean(state.isMigrated);
  return ok({
    onCurve: BigInt(state.partnerQuoteFee.toString()),
    onPosition,
    migrated,
    graduationFeeWaiting: migrated && (Number(state.migrationFeeWithdrawStatus) & PARTNER_MIGRATION_FEE_TAKEN) === 0,
  });
}

/** The partner fee on the curve, claimed straight into the Plan's escrow. */
export async function curveFeeToPlan(conn: Connection, input: { launch: Launch; claimer: PublicKey; plan: PublicKey; amount: bigint }): Promise<Outcome<Transaction>> {
  try {
    const tx = await curveClient(conn).partner.claimPartnerTradingFeeToReceiver({
      feeClaimer: input.claimer,
      payer: input.claimer,
      pool: new PublicKey(input.launch.pool),
      maxBaseAmount: new BN(0),
      maxQuoteAmount: new BN(input.amount.toString()),
      receiver: input.plan,
    });
    return ok(tx);
  } catch (err) {
    return held(`the claim could not be built (${err instanceof Error ? err.message : String(err)})`);
  }
}

/** The locked partner position's fees after graduation, claimed straight into the Plan's escrow. */
export async function positionFeeToPlan(conn: Connection, input: { launch: Launch; claimer: PublicKey; plan: PublicKey }): Promise<Outcome<Transaction>> {
  if (!input.launch.dammPool || !input.launch.partnerPosition || !input.launch.partnerPositionNftAccount) return held("not graduated yet");
  try {
    const amm = new CpAmm(conn);
    const pool = await amm.fetchPoolState(new PublicKey(input.launch.dammPool));
    const programOf = (flag: number) => (flag === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
    const tx = await amm.claimPositionFee2({
      receiver: input.plan,
      owner: input.claimer,
      feePayer: input.claimer,
      pool: new PublicKey(input.launch.dammPool),
      position: new PublicKey(input.launch.partnerPosition),
      positionNftAccount: new PublicKey(input.launch.partnerPositionNftAccount),
      tokenAVault: pool.tokenAVault,
      tokenBVault: pool.tokenBVault,
      tokenAMint: pool.tokenAMint,
      tokenBMint: pool.tokenBMint,
      tokenAProgram: programOf(pool.tokenAFlag),
      tokenBProgram: programOf(pool.tokenBFlag),
    });
    return ok(tx);
  } catch (err) {
    return held(`the position claim could not be built (${err instanceof Error ? err.message : String(err)})`);
  }
}

/** The partner's graduation fee, which DBC pays only to the claimer's own account. */
export async function migrationFeeWithdraw(conn: Connection, input: { launch: Launch; claimer: PublicKey }): Promise<Outcome<Transaction>> {
  try {
    return ok(await curveClient(conn).partner.partnerWithdrawMigrationFee({ pool: new PublicKey(input.launch.pool), sender: input.claimer }));
  } catch (err) {
    return held(`the graduation fee could not be built (${err instanceof Error ? err.message : String(err)})`);
  }
}

/** The claimer's own Nasdaq 100 account, where a graduation fee lands first. */
export function claimerQuoteAccount(claimer: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(CURVE_QUOTE_MINT, claimer, true, TOKEN_2022_PROGRAM_ID);
}

/** Move what landed in the claimer's account into the Plan's escrow, the same minute. */
export function forwardToPlan(input: { claimer: PublicKey; escrow: PublicKey; amount: bigint }) {
  return createTransferCheckedInstruction(claimerQuoteAccount(input.claimer), CURVE_QUOTE_MINT, input.escrow, input.claimer, input.amount, CURVE_QUOTE.decimals, [], TOKEN_2022_PROGRAM_ID);
}
