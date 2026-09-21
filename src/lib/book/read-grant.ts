import "server-only";

import { type Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { type Asset } from "@/lib/assets/registry";
import { resolveAsset } from "@/lib/assets/stand-in";
import { attempt, type Outcome, held, ok } from "@/lib/outcome";
import { tokenProgramFor } from "@/lib/rule/instructions";
import { SCRIP_PROGRAM_ID, discriminatorFilter, grantPda, releaseIdFromHex } from "@/lib/solana/program";
import { connection } from "@/lib/solana/connection";
import { type Grant, decodeGrant, releasableRaw, scheduledRaw } from "./decode";
import { rentFor } from "@/lib/solana/rent";

export type GrantView = Grant & {
  readonly address: string;
  readonly asset_: Asset | null;
  /** Raw units still in the escrow. */
  readonly escrowRaw: bigint;
  /** Lamports above rent: what pays for vests. */
  readonly floatLamports: bigint;
  /** What `vest` would move right now. */
  readonly releasableNow: bigint;
  /** What the schedule has released by now, capped by a revoke. */
  readonly scheduledNow: bigint;
  /** The next instant something new vests, or null when nothing more will. */
  readonly nextVestUnix: number | null;
};

/** One grant, from the chain: the account, its escrow, its float, and where the schedule stands. */
export async function readGrant(payer: string, grantIdHex: string, conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<GrantView | null>> {
  let payerKey: PublicKey;
  try {
    payerKey = new PublicKey(payer);
  } catch {
    return held("That is not a Solana address.");
  }
  const id = releaseIdFromHex(grantIdHex);
  if (!id.ok) return id;
  const address = grantPda(payerKey, id.value);
  return readGrantAt(address, conn, now);
}

export async function readGrantAt(address: PublicKey, conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<GrantView | null>> {
  return attempt("this grant", () => grantAt(address, conn, now));
}

async function grantAt(address: PublicKey, conn: Connection, now: number): Promise<Outcome<GrantView | null>> {
  let info;
  try {
    info = await conn.getAccountInfo(address, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const g = decodeGrant(info.data);
  if (!g.ok) return g;
  const asset = await resolveAsset(g.value.asset, conn);
  const escrow = asset ? getAssociatedTokenAddressSync(new PublicKey(g.value.asset), address, true, tokenProgramFor(asset)) : null;
  let escrowRaw = 0n;
  if (escrow) {
    try {
      const bal = await conn.getTokenAccountBalance(escrow, "confirmed");
      escrowRaw = BigInt(bal.value.amount);
    } catch {
      escrowRaw = 0n;
    }
  }
  const rent = Number(await rentFor(conn, info.data.length));
  return ok(view(g.value, address, asset, escrowRaw, BigInt(Math.max(0, info.lamports - rent)), now));
}

function view(g: Grant, address: PublicKey, asset: Asset | null, escrowRaw: bigint, floatLamports: bigint, now: number): GrantView {
  const scheduledNow = scheduledRaw(g, now);
  const releasableNow = g.sealed && g.state !== "completed" ? releasableRaw(g, now) : 0n;
  return { ...g, address: address.toBase58(), asset_: asset, escrowRaw, floatLamports, releasableNow, scheduledNow: g.releaseCapRaw !== null && g.releaseCapRaw < scheduledNow ? g.releaseCapRaw : scheduledNow, nextVestUnix: nextVest(g, now) };
}

/**
 * When something new vests. Before the cliff: the cliff. During the linear part: the next
 * whole raw unit's instant, which for a token with eight decimals is effectively continuous;
 * the app shows "vesting continuously" and the keeper vests on its own cadence. After: null.
 */
export function nextVest(g: Pick<Grant, "startUnix" | "cliffSecs" | "durationSecs" | "totalRaw" | "releasedRaw" | "state" | "sealed" | "releaseCapRaw">, now: number): number | null {
  if (!g.sealed || g.state === "completed") return null;
  const cliffAt = g.startUnix + g.cliffSecs;
  if (now < cliffAt) return cliffAt;
  const end = cliffAt + g.durationSecs;
  const cap = g.releaseCapRaw !== null && g.releaseCapRaw < g.totalRaw ? g.releaseCapRaw : g.totalRaw;
  if (g.releasedRaw >= cap) return null;
  return now < end ? now : null;
}

/** Every grant on the cluster, for the keeper and the indexer. */
export async function listGrants(conn: Connection = connection()): Promise<Outcome<Array<{ address: PublicKey; grant: Grant; lamports: number; dataLen: number }>>> {
  try {
    const accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Grant")] });
    const out: Array<{ address: PublicKey; grant: Grant; lamports: number; dataLen: number }> = [];
    for (const { pubkey, account } of accounts) {
      const g = decodeGrant(account.data);
      if (g.ok) out.push({ address: pubkey, grant: g.value, lamports: account.lamports, dataLen: account.data.length });
    }
    return ok(out);
  } catch (err) {
    return held(`Could not list grants (${err instanceof Error ? err.message : String(err)}).`);
  }
}
