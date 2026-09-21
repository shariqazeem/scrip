import { Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * BROADCAST A FULLY SIGNED CLAIM. The relayer already signed as fee payer in /api/claim/tx;
 * the claimer (and a claim key) signed in the browser. This only sends what it is given, and
 * only if every instruction targets this program or the system/token programs the claim
 * needs. Rate-limited by the size of the relayer's balance, which is the honest limit.
 */
const ALLOWED = new Set([
  SCRIP_PROGRAM_ID.toBase58(),
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
]);

export async function POST(req: NextRequest) {
  let body: { transactionBase64?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  if (typeof body.transactionBase64 !== "string") return NextResponse.json({ error: "No transaction." }, { status: 400 });
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(body.transactionBase64, "base64"));
  } catch {
    return NextResponse.json({ error: "The transaction could not be read." }, { status: 400 });
  }
  for (const ix of tx.instructions) {
    if (!ALLOWED.has(ix.programId.toBase58())) {
      return NextResponse.json({ error: "This relay only broadcasts Scrip claims." }, { status: 400 });
    }
  }
  if (!tx.instructions.some((ix) => ix.programId.equals(SCRIP_PROGRAM_ID))) {
    return NextResponse.json({ error: "This relay only broadcasts Scrip claims." }, { status: 400 });
  }
  const conn = connection();
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    return NextResponse.json({ signature: sig });
  } catch (err) {
    return NextResponse.json({ error: `The claim was refused (${err instanceof Error ? err.message.slice(0, 200) : String(err)}).` }, { status: 422 });
  }
}
