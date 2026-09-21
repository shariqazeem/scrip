import "server-only";

import { readFileSync } from "node:fs";
import { type Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { receipts } from "@/lib/db/schema";
import { measureReceiptIx } from "@/lib/intake/instructions";
import { type ReceiptRow, type Window, dueForMeasurement } from "@/lib/keep-rate";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { confirmSignature } from "@/lib/solana/confirm";

/**
 * THE MEASUREMENT CRANK — calls `measure_receipt` at 7 and 30 days.
 *
 * Anyone can call it; the app does, so the number exists without waiting for a stranger.
 * The crank chooses nothing: the program reads the recipient's own token account and writes
 * what it finds. The crank's keypair pays a fee and that is all it does.
 */

export function crankKeypair(): Outcome<Keypair> {
  const raw = process.env.SCRIP_CRANK_KEYPAIR?.trim();
  if (!raw) return held("SCRIP_CRANK_KEYPAIR is not set, so nothing can be measured from here.");
  try {
    const json = raw.startsWith("[") ? raw : readFileSync(raw, "utf8");
    return ok(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[])));
  } catch (err) {
    return held(`SCRIP_CRANK_KEYPAIR could not be read (${err instanceof Error ? err.message : String(err)}).`);
  }
}

export type CrankReport = { readonly due: number; readonly measured: number; readonly holds: readonly string[] };

export async function measureDue(
  conn: Connection = connection(),
  now = Math.floor(Date.now() / 1000),
  limit = 10,
): Promise<Outcome<CrankReport>> {
  const rows = await db.select().from(receipts);
  const asRows: Array<ReceiptRow & { pda: string }> = rows.map((r) => ({
    pda: r.pda,
    recipient: r.recipient,
    asset: r.asset,
    settledUnix: r.settledUnix,
    paidUsdc: BigInt(r.paidUsdc),
    amountRaw: BigInt(r.amountRaw),
    measured7dRaw: r.measured7dAt === 0 ? null : BigInt(r.measured7dRaw),
    measured30dRaw: r.measured30dAt === 0 ? null : BigInt(r.measured30dRaw),
  }));
  const jobs: Array<{ row: (typeof asRows)[number]; window: Window }> = [];
  for (const window of [7, 30] as const) {
    for (const row of dueForMeasurement(asRows, window, now) as typeof asRows) jobs.push({ row, window });
  }
  if (jobs.length === 0) return ok({ due: 0, measured: 0, holds: [] });

  const signer = crankKeypair();
  if (!signer.ok) return ok({ due: jobs.length, measured: 0, holds: [signer.why] });

  const holds: string[] = [];
  let measured = 0;
  for (const { row, window } of jobs.slice(0, limit)) {
    const asset = assetByMint(row.asset);
    if (!asset) {
      holds.push(`${row.pda.slice(0, 8)}…: asset not on the registry`);
      continue;
    }
    const ix = measureReceiptIx({ receipt: new PublicKey(row.pda), recipient: new PublicKey(row.recipient), asset, windowDays: window });
    if (!ix.ok) {
      holds.push(`${row.pda.slice(0, 8)}…: ${ix.why}`);
      continue;
    }
    try {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: signer.value.publicKey, recentBlockhash: blockhash }).add(ix.value);
      tx.sign(signer.value);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      const done = await confirmSignature(conn, sig, lastValidBlockHeight);
      if (!done.ok) throw new Error(done.why);
      measured += 1;
    } catch (err) {
      holds.push(`${row.pda.slice(0, 8)}… (${window}d): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return ok({ due: jobs.length, measured, holds });
}
