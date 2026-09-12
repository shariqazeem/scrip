import { PublicKey } from "@solana/web3.js";
import { assetByMint } from "@/lib/assets/registry";
import { DEFAULT_POLICY_BPS, assetBySymbol } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * THE MIX POLICY, CLIENT SIDE — a mirror of `Policy::validated` in the Anchor program.
 *
 * It exists so a person is told "these do not add up to 100%" while they are still editing,
 * rather than by a failed transaction they paid for. That makes it a SECOND COPY of a money
 * rule, which is the defect shape this codebase is built to avoid, so:
 *
 *   · every rule here carries the exact name of the Rust error it mirrors, and
 *   · `policy.test.ts` reads `anchor/programs/webgold/src/lib.rs` — the constants and the
 *     error enum — and fails if the two sets stop matching.
 *
 * The client must never be able to build a policy the program would refuse, and must never
 * refuse one the program would accept. The first costs a user a failed transaction; the
 * second silently removes a choice the program was willing to honour.
 */

/** Basis points in a whole. Mirrors `TOTAL_BPS`. */
export const TOTAL_BPS = 10_000;
/** Mirrors `MAX_LEGS` — a mix a person cannot hold in their head is one they did not choose. */
export const MAX_LEGS = 8;
/** Mirrors `MAX_DRIFT_BPS`. Wider than half is not a band, it is a policy that never rebalances. */
export const MAX_DRIFT_BPS = 5_000;

export type PolicyLeg = { readonly mint: string; readonly bps: number };
export type Policy = { readonly legs: readonly PolicyLeg[]; readonly driftBps: number };

/** Every rule, named after the on-chain error it mirrors. The list is the contract. */
export const POLICY_RULES = [
  "PolicyEmpty",
  "PolicyTooManyLegs",
  "PolicyWeightsWrong",
  "LegWeightZero",
  "LegMintDefault",
  "LegDuplicated",
  "DriftBandTooWide",
] as const;
export type PolicyRule = (typeof POLICY_RULES)[number];

const DEFAULT_PUBKEY = PublicKey.default.toBase58();

export function validatePolicy(policy: Policy): Outcome<Policy> {
  const { legs, driftBps } = policy;

  if (legs.length === 0) return held("A mix needs at least one asset in it.");
  if (legs.length > MAX_LEGS) {
    return held(`A mix can hold at most ${MAX_LEGS} assets. This one has ${legs.length}.`);
  }
  if (!Number.isInteger(driftBps) || driftBps < 0 || driftBps > MAX_DRIFT_BPS) {
    return held(`The drift band must be between 0% and ${MAX_DRIFT_BPS / 100}%.`);
  }

  const seen = new Set<string>();
  let total = 0;
  for (const leg of legs) {
    if (!Number.isInteger(leg.bps) || leg.bps <= 0) {
      // A zero-weight leg holds nothing and buys nothing, but it WOULD smuggle a mint into
      // the policy's whitelist — so the leg list and the permitted-asset list stay one list.
      return held(`${label(leg.mint)} has a weight of zero. Remove it instead.`);
    }
    if (leg.mint === DEFAULT_PUBKEY) return held("A mix leg cannot name the default address.");
    try {
      new PublicKey(leg.mint);
    } catch {
      return held(`"${leg.mint}" is not a valid mint address.`);
    }
    if (seen.has(leg.mint)) {
      // This can sum to exactly 10,000 and mean something nobody signed.
      return held(`${label(leg.mint)} appears twice in this mix.`);
    }
    seen.add(leg.mint);
    total += leg.bps;
  }

  if (total !== TOTAL_BPS) {
    const pct = (total / 100).toFixed(total % 100 === 0 ? 0 : 2);
    // 99.99% is not 100%: it leaves a sliver of value with no instruction about where it
    // goes, and "nearly" is not a rule.
    return held(`These add up to ${pct}%, not 100%.`);
  }

  return ok(policy);
}

function label(mint: string): string {
  return assetByMint(mint)?.symbol ?? `${mint.slice(0, 6)}…`;
}

/**
 * The default mix, built from the registry so the weights live in exactly one place.
 * A default is not a policy until the owner has signed it — nothing in the product shows
 * these as somebody's holdings until they do.
 */
export function defaultPolicy(): Policy {
  return {
    legs: DEFAULT_POLICY_BPS.map((l) => {
      const asset = assetBySymbol(l.symbol);
      if (!asset) throw new Error(`default policy names ${l.symbol}, which is not registered`);
      return { mint: asset.mint, bps: l.bps };
    }),
    // 5% — wide enough that ordinary price movement does not churn a book through fees,
    // narrow enough that a mix still means what it said.
    driftBps: 500,
  };
}

/** The DB stores a policy as JSON. One writer, one reader, both here. */
export function serializePolicy(policy: Policy): string {
  return JSON.stringify({ legs: policy.legs, driftBps: policy.driftBps });
}

export function parsePolicy(json: string): Outcome<Policy> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return held("This book's stored policy is not readable.");
  }
  if (typeof raw !== "object" || raw === null) return held("This book's stored policy is empty.");
  const obj = raw as { legs?: unknown; driftBps?: unknown };
  if (!Array.isArray(obj.legs)) return held("This book's stored policy has no legs.");
  const legs: PolicyLeg[] = [];
  for (const l of obj.legs) {
    if (typeof l !== "object" || l === null) return held("A stored policy leg is malformed.");
    const leg = l as { mint?: unknown; bps?: unknown };
    if (typeof leg.mint !== "string" || typeof leg.bps !== "number") {
      return held("A stored policy leg is malformed.");
    }
    legs.push({ mint: leg.mint, bps: leg.bps });
  }
  const driftBps = typeof obj.driftBps === "number" ? obj.driftBps : 0;
  // Re-validated on the way out, not just on the way in: a row can be edited by something
  // that is not this code, and a policy is a money rule every time it is read.
  return validatePolicy({ legs, driftBps });
}

/** The target value of one leg, in whatever unit the total is expressed in. */
export function targetOf(totalBase: bigint, bps: number): bigint {
  return (totalBase * BigInt(bps)) / BigInt(TOTAL_BPS);
}
