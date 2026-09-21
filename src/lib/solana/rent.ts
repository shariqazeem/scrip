import type { Connection } from "@solana/web3.js";

/**
 * RENT FOR A SIZE NEVER CHANGES ON A CLUSTER. The indexer asks once per book, the live poll
 * once per read, the keeper three times per sweep — all for the same handful of sizes. One
 * map per process answers them after the first.
 */
const bySize = new Map<number, bigint>();

export async function rentFor(conn: Connection, size: number): Promise<bigint> {
  const hit = bySize.get(size);
  if (hit !== undefined) return hit;
  const v = BigInt(await conn.getMinimumBalanceForRentExemption(size));
  bySize.set(size, v);
  return v;
}
