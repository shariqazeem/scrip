import type { Connection, VersionedTransactionResponse } from "@solana/web3.js";

/**
 * MANY TRANSACTIONS IN ONE ROUND TRIP. `getTransaction` once per signature is what an
 * endpoint refuses first: Solana's public RPC caps a *single method* far below its overall
 * rate, so a first index asking forty times in a row is forty refusals however slowly it
 * asks. `getTransactions` sends one JSON-RPC batch, which is one HTTP request and one call
 * against that cap, and a paid RPC bills it as one request too.
 *
 * A failed batch is not fatal: the caller gets nulls for that slice and reports them as
 * holds, the way a failed single read was reported before.
 */
export const BATCH_SIZE = 25;

export async function transactionsFor(
  conn: Connection,
  signatures: readonly string[],
  size = BATCH_SIZE,
): Promise<Map<string, VersionedTransactionResponse | null>> {
  const out = new Map<string, VersionedTransactionResponse | null>();
  for (let i = 0; i < signatures.length; i += size) {
    const slice = signatures.slice(i, i + size);
    let got: Array<VersionedTransactionResponse | null>;
    try {
      got = await conn.getTransactions([...slice], { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    } catch {
      got = slice.map(() => null);
    }
    slice.forEach((sig, n) => out.set(sig, got[n] ?? null));
  }
  return out;
}
