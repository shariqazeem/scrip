import "server-only";

import { type Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import { type Asset } from "@/lib/assets/registry";
import { resolveAsset } from "@/lib/assets/stand-in";
import { MEMO_PROGRAM_ID, reasonMatches } from "@/lib/intake/memo";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, accountDiscriminator, payoutPda, releaseIdFromHex } from "@/lib/solana/program";
import { type Receipt, decodeReceipt } from "./decode";

/**
 * A RECEIPT FROM ONE SIGNATURE, AND NOTHING ELSE.
 *
 * The public page is built from a signature alone: no session, no database. The transaction
 * names every account it touched; the one owned by the program that carries the Receipt
 * discriminator is the receipt. The memo instruction in the same transaction is the reason,
 * checked against the hash the program stored, so a reason cannot be substituted later.
 */

export type ReceiptView = Receipt & {
  readonly address: string;
  readonly signature: string;
  readonly slot: number | null;
  readonly blockTime: number | null;
  readonly asset_: Asset | null;
  /** The memo from the transaction, only if it hashes to the receipt's reason_hash. */
  readonly reason: string | null;
  /** True when a memo was present but did not match — shown, never hidden. */
  readonly reasonMismatch: boolean;
  /** The receipt account's lamports: its rent, which stays with it on chain. */
  readonly rentLamports: number;
  /**
   * What the `book` account (the register's float, or a grant's) lost in this transaction.
   * For a sweep or a vest that is exactly what the program paid out: tip, receipt rent, and
   * any account it advanced. Null when the transaction carried no balances.
   */
  readonly floatSpentLamports: number | null;
};

/**
 * NOT FOUND IS USUALLY "NOT YET". Every flow in the product sends a transaction and opens its
 * receipt a moment later, and a transaction that is seconds old is often not yet readable at
 * `confirmed`. The page used to answer that moment with "There is no receipt at that
 * signature" — final-sounding, and false: the first claim under Phantom's signing order was
 * finalized on mainnet while its receipt page said it did not exist. So the page tells this
 * case apart, says the receipt is settling, and keeps looking before it ever says "none".
 */
export const NOT_YET_SETTLED = "No transaction with that signature has settled on this cluster.";

export async function readReceiptBySignature(signature: string): Promise<Outcome<ReceiptView>> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return held("That is not a transaction signature.");
  const conn = connection();
  let tx: VersionedTransactionResponse | null;
  try {
    tx = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!tx) return held(NOT_YET_SETTLED);
  if (tx.meta?.err) return held("That transaction failed, so nothing moved and no receipt was written.");
  return receiptFromTransaction(conn, signature, tx);
}

export async function receiptFromTransaction(
  conn: Connection,
  signature: string,
  tx: VersionedTransactionResponse,
): Promise<Outcome<ReceiptView>> {
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined });
  const candidates: PublicKey[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys.get(i);
    if (k) candidates.push(k);
  }
  let infos;
  try {
    infos = await conn.getMultipleAccountsInfo(candidates, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  const disc = accountDiscriminator("Receipt");
  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i];
    if (!info || !info.owner.equals(SCRIP_PROGRAM_ID) || info.data.length < 8) continue;
    if (!disc.every((b, j) => info.data[j] === b)) continue;
    const decoded = decodeReceipt(info.data);
    if (!decoded.ok) return decoded;
    const r = decoded.value;
    const memo = memoOf(tx);
    const matches = memo !== null && reasonMatches(memo, r.reasonHash);
    // The reason is usually the memo in the transaction that wrote the receipt. A gift is the
    // exception: the payer's memo is in the transaction that FUNDED it, and the receipt is
    // written later by the claim, which carries none — so every claimed gift showed no
    // reason, breaking "a stock can remember why it arrived" on the very flow new people
    // use. A vest is the same: the grant's memo is in the sealing transaction, and a keeper's
    // vest carries none. Look where the reason actually is, and accept it only if it hashes
    // to what the program stored, so nobody can substitute one after the fact.
    const hasReason = !r.reasonHash.every((b) => b === 0);
    const reason = matches ? memo : hasReason ? await reasonFromOrigin(conn, r) : null;
    // Balances follow the same key order as getAccountKeys with lookups: static, then loaded.
    const bookIdx = candidates.findIndex((k) => k.toBase58() === r.book);
    const pre = bookIdx >= 0 ? tx.meta?.preBalances?.[bookIdx] : undefined;
    const post = bookIdx >= 0 ? tx.meta?.postBalances?.[bookIdx] : undefined;
    return ok({
      ...r,
      address: candidates[i]!.toBase58(),
      signature,
      slot: tx.slot ?? null,
      blockTime: tx.blockTime ?? null,
      asset_: await resolveAsset(r.asset, conn),
      reason,
      reasonMismatch: memo !== null && !matches && hasReason && reason === null,
      rentLamports: info.lamports,
      floatSpentLamports: pre !== undefined && post !== undefined ? pre - post : null,
    });
  }
  return held("This transaction did not write a Scrip receipt.");
}

/**
 * WHERE A REASON LIVES WHEN IT IS NOT IN THE RECEIPT'S OWN TRANSACTION.
 *
 *   pay / gift  the Payout ["payout", payer, release_id] — its first transaction funded it
 *   vest        the Grant (the receipt's `book`) — its first transaction opened and sealed it
 *
 * The account may be closed by now (a claimed Payout always is); its signatures stay in the
 * ledger's history either way. Oldest first, a handful at most, and only a memo that hashes to
 * the receipt's own reason_hash counts.
 */
async function reasonFromOrigin(conn: Connection, r: Receipt): Promise<string | null> {
  let origin: PublicKey | null = null;
  try {
    if ((r.kind === "gift" || r.kind === "pay") && r.payer) {
      const rid = releaseIdFromHex(r.releaseId);
      if (rid.ok) origin = payoutPda(new PublicKey(r.payer), rid.value);
    } else if (r.kind === "vest") {
      origin = new PublicKey(r.book);
    }
  } catch {
    return null;
  }
  if (!origin) return null;
  try {
    const sigs = await conn.getSignaturesForAddress(origin, { limit: 1000 }, "confirmed");
    const oldestFirst = sigs.filter((s) => !s.err).reverse().slice(0, 4);
    for (const s of oldestFirst) {
      const t = await conn.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!t) continue;
      const m = memoOf(t);
      if (m !== null && reasonMatches(m, r.reasonHash)) return m;
    }
  } catch {
    return null;
  }
  return null;
}

/** The first SPL Memo in a transaction, decoded as UTF-8. */
export function memoOf(tx: VersionedTransactionResponse): string | null {
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined });
  const memoProgram = new PublicKey(MEMO_PROGRAM_ID);
  for (const ix of tx.transaction.message.compiledInstructions) {
    const program = keys.get(ix.programIdIndex);
    if (program && program.equals(memoProgram)) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(ix.data);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Read a receipt account directly, by address. For the indexer's refresh pass. */
export async function readReceiptAccount(conn: Connection, address: PublicKey): Promise<Outcome<Receipt | null>> {
  let info;
  try {
    info = await conn.getAccountInfo(address, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const r = decodeReceipt(info.data);
  return r.ok ? ok(r.value) : r;
}
