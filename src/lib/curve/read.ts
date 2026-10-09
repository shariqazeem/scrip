import "server-only";

import { PublicKey } from "@solana/web3.js";
import { planAt } from "@/lib/plan/read";
import { connection } from "@/lib/solana/connection";
import { readTxViews } from "@/lib/solana/tx-view";
import { feesWaiting, curveClient } from "./claims";
import { DEPLOYED, type Launch } from "./deployed";
import { CURVE_QUOTE, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, THRESHOLD_QUOTE } from "./preset";

/**
 * SCRIP CURVE, READ FROM THE CHAIN — the Plan the launches fund, each launch's curve, and every
 * fee that reached the Plan's escrow, for /curve. Every figure is an account or a transaction read
 * now; when nothing is deployed the page says so. Held for a minute: the page is public and the
 * chain is the scarce thing.
 */
export type LaunchView = Launch & {
  readonly quoteReserveRaw: bigint | null;
  readonly thresholdRaw: bigint;
  readonly feeWaitingRaw: bigint | null;
  readonly migrated: boolean | null;
};

export type FeeInflow = {
  readonly sig: string;
  readonly at: number;
  readonly raw: bigint;
  readonly from: "the curve" | "the graduated pool" | "the graduation fee";
};

export type CurvePlanView = {
  readonly address: string;
  readonly escrow: string;
  readonly name: string | null;
  readonly sponsorHandle: string | null;
  readonly escrowRaw: bigint | null;
  readonly members: number;
  readonly matches: number;
  readonly matchedRaw: bigint;
  readonly matchedUsdc: bigint;
  /** Every fee transfer into the escrow found in its recent history, newest first. */
  readonly inflows: readonly FeeInflow[];
  readonly fromLaunchesRaw: bigint;
};

const HOLD_MS = 60_000;
const g = globalThis as typeof globalThis & { __scripCurveRead?: { at: number; plan: Promise<CurvePlanView | null>; launches: Promise<LaunchView[]> } };

export function readCurve(): { plan: Promise<CurvePlanView | null>; launches: Promise<LaunchView[]> } {
  const hit = g.__scripCurveRead;
  if (hit && Date.now() - hit.at < HOLD_MS) return hit;
  const fresh = { at: Date.now(), plan: readPlan().catch(() => null), launches: readLaunches().catch(() => []) };
  g.__scripCurveRead = fresh;
  return fresh;
}

async function readPlan(): Promise<CurvePlanView | null> {
  const p = DEPLOYED.plan;
  if (!p) return null;
  const view = await planAt(p.address);
  const plan = view.ok ? view.value : null;
  const inflows = await feeInflows(new PublicKey(p.escrow));
  return {
    address: p.address,
    escrow: p.escrow,
    name: plan?.name ?? null,
    sponsorHandle: plan?.sponsorHandle ?? null,
    escrowRaw: plan?.escrowRaw ?? null,
    members: plan?.members ?? 0,
    matches: plan?.matches ?? 0,
    matchedRaw: plan?.matchedRaw ?? 0n,
    matchedUsdc: plan?.matchedUsdc ?? 0n,
    inflows,
    fromLaunchesRaw: inflows.reduce((n, f) => n + f.raw, 0n),
  };
}

/**
 * The escrow's recent history, kept to what came from a launch: Meteora's curve or graduated pool
 * claiming into it, or the fee claimer forwarding a graduation fee. A sponsor's own top-up or a
 * match paid out is neither, and is left out.
 */
async function feeInflows(escrow: PublicKey): Promise<FeeInflow[]> {
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(escrow, { limit: 50 }, "confirmed").catch(() => []);
  const views = await readTxViews(
    conn,
    sigs.filter((s) => !s.err).map((s) => s.signature),
  ).catch(() => []);
  const claimer = DEPLOYED.feeClaimer;
  const out: FeeInflow[] = [];
  for (const v of views) {
    if (!v || v.err) continue;
    const i = v.keys.indexOf(escrow.toBase58());
    if (i < 0) continue;
    const before = BigInt(v.preTokenBalances.find((b) => b.accountIndex === i)?.uiTokenAmount.amount ?? "0");
    const after = BigInt(v.postTokenBalances.find((b) => b.accountIndex === i)?.uiTokenAmount.amount ?? "0");
    if (after <= before) continue;
    const programs = new Set([...v.instructions, ...v.inner].map((x) => x.programId));
    const from = programs.has(DBC_PROGRAM_ID.toBase58())
      ? "the curve"
      : programs.has(DAMM_V2_PROGRAM_ID.toBase58())
        ? "the graduated pool"
        : claimer && v.signers.includes(claimer)
          ? "the graduation fee"
          : null;
    if (from) out.push({ sig: v.sig, at: v.blockTime, raw: after - before, from });
  }
  return out.sort((a, b) => b.at - a.at);
}

async function readLaunches(): Promise<LaunchView[]> {
  if (DEPLOYED.launches.length === 0) return [];
  const conn = connection();
  const dbc = curveClient(conn);
  const scale = 10 ** CURVE_QUOTE.decimals;
  return Promise.all(
    DEPLOYED.launches.map(async (l) => {
      const [state, waiting] = await Promise.all([dbc.state.getPool(l.pool).catch(() => null), feesWaiting(conn, l)]);
      const s = state?.poolState;
      return {
        ...l,
        quoteReserveRaw: s ? BigInt(s.quoteReserve.toString()) : null,
        thresholdRaw: BigInt(Math.round(THRESHOLD_QUOTE[l.kind] * scale)),
        feeWaitingRaw: waiting.ok ? waiting.value.onCurve + waiting.value.onPosition : null,
        migrated: s ? Boolean(s.isMigrated) : null,
      };
    }),
  );
}
