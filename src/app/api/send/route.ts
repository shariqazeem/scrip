import { VersionedTransaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * BROADCAST A SIGNED SCRIP TRANSACTION. A run signs many transactions in one wallet prompt
 * and sends them here one by one; the server only relays what the wallet already signed,
 * and only if the transaction touches this program. The payer paid; nothing here can spend.
 */
export async function POST(req: NextRequest) {
  let body: { transactionBase64?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  if (typeof body.transactionBase64 !== "string") return NextResponse.json({ error: "No transaction." }, { status: 400 });
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(body.transactionBase64, "base64"));
  } catch {
    return NextResponse.json({ error: "The transaction could not be read." }, { status: 400 });
  }
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  if (!keys.includes(SCRIP_PROGRAM_ID.toBase58())) return NextResponse.json({ error: "This relay only broadcasts Scrip transactions." }, { status: 400 });
  if (!tx.signatures[0] || tx.signatures[0].every((b) => b === 0)) return NextResponse.json({ error: "The transaction is not signed." }, { status: 400 });
  const conn = connection();
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    return NextResponse.json({ signature: sig });
  } catch (err) {
    return NextResponse.json({ error: `Refused (${err instanceof Error ? err.message.slice(0, 200) : String(err)}).` }, { status: 422 });
  }
}
