import type { Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * CONFIRM BY ASKING, NOT BY SUBSCRIBING. web3.js confirms a signature over a WebSocket, and
 * a WebSocket is a connection: Solana's public endpoints refuse one per transaction long
 * before they mind the calls, and the failure arrives as "Unexpected server response: 429"
 * with the transaction already sent. Polling `getSignatureStatuses` goes through the same
 * gated HTTP path as every other read, so a confirmation costs what a read costs and the
 * endpoint sees one socket.
 *
 * It stops when the signature is confirmed, when the chain says the transaction failed, or
 * when the blockhash it was signed against can no longer be accepted — which is the only
 * honest way to say "it will never land".
 */
const EVERY_MS = 1_500;

/**
 * `resend`, when given, re-broadcasts the SAME signed bytes while the signature is unseen. A
 * leader that drops a transaction does not say so: without a resend the only signal is the
 * blockhash expiring, a minute later. On mainnet that minute was the whole gap between "money
 * landed" and "stock arrived" on the second sweep ever made. The same signature cannot land
 * twice, so resending is always safe; it stops the moment the network has seen it.
 */
export async function confirmSignature(
  conn: Connection,
  signature: string,
  lastValidBlockHeight: number,
  commitment: "confirmed" | "finalized" = "confirmed",
  resend?: () => Promise<unknown>,
): Promise<Outcome<string>> {
  for (;;) {
    const statuses = await conn.getSignatureStatuses([signature], { searchTransactionHistory: false });
    const status = statuses.value[0];
    if (status) {
      if (status.err) return held(`The transaction failed on chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === commitment || status.confirmationStatus === "finalized") return ok(signature);
    } else if (resend) {
      await resend().catch(() => undefined);
    }
    const height = await conn.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) return held("The transaction was not confirmed before its blockhash expired; nothing was signed twice, so it can be sent again.");
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
}

/** Sign, send, and wait — the whole thing over HTTP. Throws what the RPC throws, like web3.js. */
export async function sendAndConfirm(conn: Connection, tx: Transaction, signers: Keypair[]): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = tx.feePayer ?? signers[0]!.publicKey;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  const done = await confirmSignature(conn, sig, lastValidBlockHeight);
  if (!done.ok) throw new Error(done.why);
  return sig;
}

/** The same for a versioned transaction, which carries its own blockhash. */
export async function sendAndConfirmV0(conn: Connection, tx: VersionedTransaction, lastValidBlockHeight: number): Promise<string> {
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, preflightCommitment: "confirmed" });
  const done = await confirmSignature(conn, sig, lastValidBlockHeight);
  if (!done.ok) throw new Error(done.why);
  return sig;
}
