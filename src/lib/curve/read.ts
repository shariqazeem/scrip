import "server-only";

import { PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { DynamicFeeSharingClient } from "@meteora-ag/dynamic-fee-sharing-sdk";
import { mainnetConnection } from "@/lib/solana/connection";
import { DEPLOYED, type Launch } from "./deployed";

/**
 * SCRIP CURVE, READ FROM THE CHAIN — the vault's books and each launch's state, for /curve.
 * Every figure is an account read now; when nothing is deployed yet the page says so.
 */
export type VaultView = {
  readonly address: string;
  readonly fundedUsdc: number;
  readonly claimedUsdc: number;
  readonly waitingUsdc: number;
  readonly recipients: ReadonlyArray<{ address: string; role: "Savings Pool" | "Scrip" | "recipient"; totalUsdc: number; takenUsdc: number }>;
};

export type LaunchView = Launch & {
  readonly quoteReserveUsdc: number | null;
  readonly partnerFeeWaitingUsdc: number | null;
  readonly migrated: boolean | null;
};

const usd = (bn: { toString(): string }) => Number(bn.toString()) / 1e6;

export async function readVault(): Promise<VaultView | null> {
  const v = DEPLOYED.vault;
  if (!v) return null;
  const dfs = new DynamicFeeSharingClient(mainnetConnection(), "confirmed");
  const b = await dfs.getFeeBreakdown(new PublicKey(v.address)).catch(() => null);
  if (!b) return { address: v.address, fundedUsdc: 0, claimedUsdc: 0, waitingUsdc: 0, recipients: [] };
  return {
    address: v.address,
    fundedUsdc: usd(b.totalFundedFee),
    claimedUsdc: usd(b.totalClaimedFee),
    waitingUsdc: usd(b.totalUnclaimedFee),
    recipients: b.userFees.map((u) => {
      const a = u.address.toBase58();
      return { address: a, role: a === v.savingsPool ? "Savings Pool" : a === v.scrip ? "Scrip" : "recipient", totalUsdc: usd(u.totalFee), takenUsdc: usd(u.feeClaimed) };
    }),
  };
}

export async function readLaunches(): Promise<LaunchView[]> {
  if (DEPLOYED.launches.length === 0) return [];
  const dbc = DynamicBondingCurveClient.create(mainnetConnection(), "confirmed");
  return Promise.all(
    DEPLOYED.launches.map(async (l) => {
      const s = (await dbc.state.getPool(l.pool).catch(() => null))?.poolState;
      return {
        ...l,
        quoteReserveUsdc: s ? usd(s.quoteReserve) : null,
        partnerFeeWaitingUsdc: s ? usd(s.partnerQuoteFee) : null,
        migrated: s ? Boolean(s.isMigrated) : null,
      };
    }),
  );
}
