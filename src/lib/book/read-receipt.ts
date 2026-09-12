import "server-only";

import { PublicKey } from "@solana/web3.js";
import idlJson from "@/lib/anchor/webgold.json";
import { assetByMint } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { WEBGOLD_PROGRAM_ID } from "@/lib/solana/program";
import { connection } from "./read-book";

/**
 * READ AN ARRIVAL FROM ITS TRANSACTION.
 *
 * A receipt page is opened by somebody who has a link and nothing else — no account, no
 * session, often no idea what Webgold is. So the whole page is built from one signature: the
 * transaction is fetched, the receipt account it created is found, and the account is read.
 *
 * Nothing here touches the database. That is the point of putting the receipt on chain: this
 * page renders identically from a cold RPC with our servers switched off, and it will render
 * in ten years if somebody keeps the link.
 */

export type ReceiptLeg = {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly issuer: string;
  readonly decimals: number;
  readonly amount: bigint;
};

export type ReceiptView = {
  readonly signature: string;
  readonly address: string;
  readonly payer: string;
  readonly recipient: string;
  readonly releaseId: string;
  /** USD value at the stamp, 6-decimal base units. */
  readonly valueBase: bigint;
  /** Fine grams of gold, 1e8 fixed point, stamped when it settled. */
  readonly gramsE8: bigint;
  readonly reason: string;
  readonly at: number;
  readonly legs: readonly ReceiptLeg[];
  /** The slot the transaction landed in — the chain's own ordering, not ours. */
  readonly slot: number | null;
};

/**
 * The Anchor discriminator for the `Receipt` account, read from the committed IDL rather than
 * typed out. Eight bytes copied by hand is eight bytes that can be copied wrong, and a wrong
 * discriminator does not error — it simply never matches, and every receipt page reads
 * "that transaction wrote no receipt".
 */
const RECEIPT_DISCRIMINATOR: Uint8Array | null = (() => {
  const accounts = (idlJson as { accounts?: Array<{ name: string; discriminator: number[] }> })
    .accounts;
  const found = accounts?.find((a) => a.name === "Receipt");
  return found ? Uint8Array.from(found.discriminator) : null;
})();

export async function readReceiptBySignature(signature: string): Promise<Outcome<ReceiptView>> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) {
    return held("That does not look like a Solana transaction signature.");
  }

  const conn = connection();
  let tx;
  try {
    tx = await conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    return held(
      `Could not reach the chain (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  if (!tx) {
    // A signature that is not on THIS cluster is the commonest reason, and saying so is more
    // use than "not found".
    return held("No transaction with that signature has settled on this cluster.");
  }
  if (tx.meta?.err) {
    return held("That transaction failed, so nothing was received and no receipt exists.");
  }

  const keys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  });
  const candidates: PublicKey[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys.get(i);
    if (key) candidates.push(key);
  }

  // The receipt is whichever account this transaction created that is owned by the program
  // and carries the Receipt discriminator. Fetching them in one batch keeps the page to two
  // round trips no matter how many accounts the transaction touched.
  let infos;
  try {
    infos = await conn.getMultipleAccountsInfo(candidates, "confirmed");
  } catch (err) {
    return held(
      `Could not reach the chain (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i];
    if (!info || !info.owner.equals(WEBGOLD_PROGRAM_ID)) continue;
    if (!RECEIPT_DISCRIMINATOR || info.data.length < 8) continue;
    if (!sameBytes(info.data.subarray(0, 8), RECEIPT_DISCRIMINATOR)) continue;

    const decoded = decodeReceipt(info.data);
    if (!decoded.ok) return decoded;
    return ok({
      ...decoded.value,
      signature,
      address: candidates[i]!.toBase58(),
      slot: tx.slot ?? null,
    });
  }

  return held("That transaction settled, but it did not write a Webgold receipt.");
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Decode the `Receipt` account, in the program's own field order.
 *
 * Hand-decoded rather than routed through an Anchor client, for the same reason the book is:
 * opening a receipt should not require a Provider, a Wallet and a signer on a page that is
 * only looking. `program.test.ts` guards the program id, and the discriminator above is read
 * from the committed IDL rather than typed out.
 */
function decodeReceipt(
  data: Uint8Array,
): Outcome<Omit<ReceiptView, "signature" | "address" | "slot">> {
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
    if (reasonLen > 200) return held("This receipt's reason is longer than the program allows.");
    const reason = new TextDecoder().decode(data.slice(o, o + reasonLen));
    o += reasonLen;
    const at = Number(view.getBigInt64(o, true));
    o += 8;
    o += 1; // bump
    const legCount = view.getUint32(o, true);
    o += 4;
    if (legCount > 8) return held("This receipt claims more legs than the program allows.");

    const legs: ReceiptLeg[] = [];
    for (let i = 0; i < legCount; i += 1) {
      const mint = new PublicKey(data.slice(o, o + 32)).toBase58();
      o += 32;
      const amount = view.getBigUint64(o, true);
      o += 8;
      const asset = assetByMint(mint);
      legs.push({
        mint,
        // An arrival of something the registry has never heard of still renders — it just
        // renders as the mint it is, with no name invented for it.
        symbol: asset?.symbol ?? `${mint.slice(0, 4)}…`,
        name: asset?.name ?? "Unrecognised mint",
        issuer: asset?.issuer.name ?? "Unknown issuer",
        decimals: asset?.decimals ?? 0,
        amount,
      });
    }

    return ok({ payer, recipient, releaseId, valueBase, gramsE8, reason, at, legs });
  } catch {
    return held("This receipt account could not be decoded.");
  }
}
