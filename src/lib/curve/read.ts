import "server-only";

import { PublicKey } from "@solana/web3.js";
import { planAt } from "@/lib/plan/read";
import { connection } from "@/lib/solana/connection";
import { readTxViews } from "@/lib/solana/tx-view";
import { DEPLOYED } from "./deployed";
import { type ChainLaunch, launchesOnChain } from "./launches";
import { CURVE_STOCKS, type CurveStock, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID } from "./preset";

/**
 * SCRIP CURVE, READ FROM THE CHAIN — the Plan in each stock that the launches fund, every launch on
 * every config, and every fee that reached a Plan's escrow, for /curve. Every figure is an account
 * or a transaction read now; when nothing is deployed the page says so. Held for a minute: the
 * page is public and the chain is the scarce thing.
 */
export type FeeInflow = {
  readonly sig: string;
  readonly at: number;
  readonly raw: bigint;
  readonly from: "the curve" | "the graduated pool" | "the graduation fee";
};

export type CurvePlanView = {
  readonly stock: CurveStock;
  readonly address: string;
  readonly escrow: string;
  readonly name: string | null;
  readonly sponsorHandle: string | null;
  readonly escrowRaw: bigint | null;
  readonly decimals: number;
  readonly members: number;
  readonly matches: number;
  readonly matchedRaw: bigint;
  readonly matchedUsdc: bigint;
  /** Every fee transfer into the escrow found in its recent history, newest first. */
  readonly inflows: readonly FeeInflow[];
  readonly fromLaunchesRaw: bigint;
};

const HOLD_MS = 60_000;
type Read = { at: number; plans: Promise<CurvePlanView[]>; launches: Promise<ChainLaunch[]> };
const g = globalThis as typeof globalThis & { __scripCurveRead2?: Read };

export function readCurve(): Read {
  const hit = g.__scripCurveRead2;
  if (hit && Date.now() - hit.at < HOLD_MS) return hit;
  const fresh: Read = {
    at: Date.now(),
    plans: readPlans().catch(() => []),
    launches: launchesOnChain(connection()).then((r) => (r.ok ? r.value : []), () => []),
  };
  g.__scripCurveRead2 = fresh;
  return fresh;
}

/**
 * Scrip Curve in one line, for the pages that mention it beside the rest of Scrip: how many
 * launches are on chain, how many graduated, and how many fees reached a Plan. Null when the
 * chain could not be read, so a page says nothing rather than a zero that means "unknown".
 */
export type CurveCounts = { readonly launches: number; readonly graduated: number; readonly fees: number };
export async function curveCounts(): Promise<CurveCounts | null> {
  const read = readCurve();
  const [plans, launches] = await Promise.all([read.plans, read.launches]);
  if (launches.length === 0 && plans.length === 0) return null;
  return { launches: launches.length, graduated: launches.filter((l) => l.migrated).length, fees: plans.reduce((n, p) => n + p.inflows.length, 0) };
}

async function readPlans(): Promise<CurvePlanView[]> {
  const out: CurvePlanView[] = [];
  for (const stock of CURVE_STOCKS) {
    const p = DEPLOYED.plans[stock];
    if (!p) continue;
    const view = await planAt(p.address);
    const plan = view.ok ? view.value : null;
    const inflows = await feeInflows(new PublicKey(p.escrow));
    out.push({
      stock,
      address: p.address,
      escrow: p.escrow,
      name: plan?.name ?? null,
      sponsorHandle: plan?.sponsorHandle ?? null,
      escrowRaw: plan?.escrowRaw ?? null,
      decimals: plan?.decimals ?? 8,
      members: plan?.members ?? 0,
      matches: plan?.matches ?? 0,
      matchedRaw: plan?.matchedRaw ?? 0n,
      matchedUsdc: plan?.matchedUsdc ?? 0n,
      inflows,
      fromLaunchesRaw: inflows.reduce((n, f) => n + f.raw, 0n),
    });
  }
  return out;
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
