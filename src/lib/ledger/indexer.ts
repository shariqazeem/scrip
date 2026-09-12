import "server-only";

import { PublicKey } from "@solana/web3.js";
import { and, desc, eq, sql } from "drizzle-orm";
import idlJson from "@/lib/anchor/webgold.json";
import { connection } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { newId } from "@/lib/db/keys";
import { cohorts, receipts } from "@/lib/db/schema";
import { assetByMint } from "@/lib/assets/registry";
import { toSafeNumber } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import { WEBGOLD_PROGRAM_ID } from "@/lib/solana/program";

/**
 * THE RECEIPT INDEXER — mirrors on-chain receipts into the cache so a page is fast.
 *
 * THE DATABASE IS A CACHE. THE CHAIN IS THE MEMORY. Nothing here is a source of truth:
 * delete the file and a re-index rebuilds it from Solana, because every row is a copy of an
 * account that still exists. That is why `/receipt/[sig]` reads the chain directly and never
 * this table — the page a stranger opens must not depend on our having indexed anything.
 *
 * What the cache buys is the LEDGER: counting every receipt in the product by walking the
 * chain on each page load would be slow at ten receipts and impossible at ten thousand.
 *
 * It walks backwards from the newest signature and stops at the first one it has already
 * seen, so a routine run is one RPC page. The public devnet and mainnet endpoints rate-limit
 * hard, so the batch size is small and deliberate rather than tuned for a paid provider.
 */

const RECEIPT_DISCRIMINATOR: Uint8Array | null = (() => {
  const accounts = (idlJson as { accounts?: Array<{ name: string; discriminator: number[] }> })
    .accounts;
  const found = accounts?.find((a) => a.name === "Receipt");
  return found ? Uint8Array.from(found.discriminator) : null;
})();

export type IndexReport = {
  /** Signatures examined on this run. */
  readonly scanned: number;
  /** Receipts written that we had not seen before. */
  readonly added: number;
  /** Signatures that carried no Webgold receipt — ordinary, not a failure. */
  readonly skipped: number;
  /** Anything that could not be read, said out loud rather than swallowed. */
  readonly holds: readonly string[];
};

export async function indexReceipts(limit = 50): Promise<Outcome<IndexReport>> {
  if (!RECEIPT_DISCRIMINATOR) return held("The committed IDL has no Receipt account in it.");

  const conn = connection();
  const known = await db
    .select({ sig: receipts.sig })
    .from(receipts)
    .orderBy(desc(receipts.at))
    .limit(1);
  const stopAt = known[0]?.sig;

  let signatures;
  try {
    signatures = await conn.getSignaturesForAddress(
      WEBGOLD_PROGRAM_ID,
      { limit, ...(stopAt ? { until: stopAt } : {}) },
      "confirmed",
    );
  } catch (err) {
    return held(
      `Could not list the program's transactions (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const holds: string[] = [];
  let added = 0;
  let skipped = 0;

  for (const entry of signatures) {
    if (entry.err) {
      // A failed transaction moved nothing and wrote no receipt. Not an error to report.
      skipped += 1;
      continue;
    }
    const existing = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(eq(receipts.sig, entry.signature))
      .limit(1);
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const found = await receiptFromSignature(conn, entry.signature);
    if (!found.ok) {
      // Most signatures on this program are `open_book` or `set_policy` and carry no receipt.
      if (!found.why.includes("no Webgold receipt")) holds.push(found.why);
      skipped += 1;
      continue;
    }

    const r = found.value;
    const valueBase = toSafeNumber(r.valueBase, "receipt value");
    if (!valueBase.ok) {
      holds.push(`${entry.signature}: ${valueBase.why}`);
      continue;
    }

    await db.insert(receipts).values({
      id: newId("rcp"),
      pda: r.address,
      sig: entry.signature,
      kind: "payout",
      payer: r.payer,
      recipient: r.recipient,
      legsJson: JSON.stringify(r.legs),
      valueBase: valueBase.value,
      gramsAtStamp: (Number(r.gramsE8) / 1e8).toFixed(8),
      reason: r.reason,
      releaseId: r.releaseId,
      at: r.at,
    });

    /**
     * THE COHORT ROW, and the one thing about it that matters: `value_at_release_base` is
     * copied from the receipt, which the PROGRAM stamped when the value moved. It is never
     * recomputed here and never rewritten. A keep-rate measured against a number this indexer
     * chose after the fact would be a keep-rate we invented.
     */
    await db
      .insert(cohorts)
      .values({
        id: newId("coh"),
        releaseId: r.releaseId,
        recipient: r.recipient,
        valueAtReleaseBase: valueBase.value,
        releasedAt: r.at,
      })
      .onConflictDoNothing();

    added += 1;
  }

  return ok({ scanned: signatures.length, added, skipped, holds });
}

type IndexedReceipt = {
  address: string;
  payer: string;
  recipient: string;
  releaseId: string;
  valueBase: bigint;
  gramsE8: bigint;
  reason: string;
  at: number;
  legs: Array<{ mint: string; symbol: string; amount: string }>;
};

async function receiptFromSignature(
  conn: ReturnType<typeof connection>,
  signature: string,
): Promise<Outcome<IndexedReceipt>> {
  const tx = await conn.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return held(`${signature}: the transaction could not be fetched.`);

  const keys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  });
  const candidates: PublicKey[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys.get(i);
    if (key) candidates.push(key);
  }

  const infos = await conn.getMultipleAccountsInfo(candidates, "confirmed");
  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i];
    if (!info || !info.owner.equals(WEBGOLD_PROGRAM_ID) || info.data.length < 8) continue;
    if (!sameBytes(info.data.subarray(0, 8), RECEIPT_DISCRIMINATOR!)) continue;
    const decoded = decode(info.data);
    if (!decoded.ok) return decoded;
    return ok({ ...decoded.value, address: candidates[i]!.toBase58() });
  }
  return held(`${signature}: no Webgold receipt.`);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function decode(data: Uint8Array): Outcome<Omit<IndexedReceipt, "address">> {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8;
    const payer = new PublicKey(data.slice(o, o + 32)).toBase58();
    o += 32;
    const recipient = new PublicKey(data.slice(o, o + 32)).toBase58();
    o += 32;
    const releaseId = [...data.slice(o, o + 32)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    o += 32;
    const valueBase = view.getBigUint64(o, true);
    o += 8;
    const gramsE8 = view.getBigUint64(o, true);
    o += 8;
    const reasonLen = view.getUint32(o, true);
    o += 4;
    if (reasonLen > 200) return held("a receipt's reason is longer than the program allows");
    const reason = new TextDecoder().decode(data.slice(o, o + reasonLen));
    o += reasonLen;
    const at = Number(view.getBigInt64(o, true));
    o += 8;
    o += 1;
    const legCount = view.getUint32(o, true);
    o += 4;
    if (legCount > 8) return held("a receipt claims more legs than the program allows");
    const legs: IndexedReceipt["legs"] = [];
    for (let i = 0; i < legCount; i += 1) {
      const mint = new PublicKey(data.slice(o, o + 32)).toBase58();
      o += 32;
      const amount = view.getBigUint64(o, true);
      o += 8;
      legs.push({ mint, symbol: assetByMint(mint)?.symbol ?? mint.slice(0, 4), amount: amount.toString() });
    }
    return ok({ payer, recipient, releaseId, valueBase, gramsE8, reason, at, legs });
  } catch {
    return held("a receipt account could not be decoded");
  }
}

/** Every aggregate the public ledger shows, computed from the cache in one pass. */
export async function ledgerTotals() {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      value: sql<number>`coalesce(sum(${receipts.valueBase}), 0)`,
      grams: sql<string>`coalesce(sum(cast(${receipts.gramsAtStamp} as real)), 0)`,
      recipients: sql<number>`count(distinct ${receipts.recipient})`,
      payers: sql<number>`count(distinct ${receipts.payer})`,
      releases: sql<number>`count(distinct ${receipts.releaseId})`,
    })
    .from(receipts);
  const t = rows[0];
  return {
    receipts: Number(t?.count ?? 0),
    valueBase: BigInt(Math.round(Number(t?.value ?? 0))),
    grams: Number(t?.grams ?? 0),
    recipients: Number(t?.recipients ?? 0),
    payers: Number(t?.payers ?? 0),
    releases: Number(t?.releases ?? 0),
  };
}

/** The event stream: real receipts, newest first. Never a fabricated row. */
export async function recentReceipts(limit = 25) {
  return db.select().from(receipts).orderBy(desc(receipts.at)).limit(limit);
}

/** One recipient's arrivals, for a book page that has opted in. */
export async function receiptsFor(recipient: string, limit = 25) {
  return db
    .select()
    .from(receipts)
    .where(and(eq(receipts.recipient, recipient)))
    .orderBy(desc(receipts.at))
    .limit(limit);
}
