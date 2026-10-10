import { VersionedTransaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID } from "@/lib/curve/preset";
import { confirmSignature } from "@/lib/solana/confirm";
import { connection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

/**
 * BROADCAST A SIGNED SCRIP CURVE TRANSACTION. A launch is signed by the wallet first and then by
 * the new token's own key in the browser, so the wallet cannot send it itself; a launch or a buy
 * too long for one transaction is two, signed in one prompt and sent here one after the other.
 * The server only relays what was already signed, and only if it touches Meteora's curve, its
 * graduated pools, or Jupiter. The wallet paid; nothing here can spend.
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
  const keys = new Set(tx.message.staticAccountKeys.map((k) => k.toBase58()));
  if (![DBC_PROGRAM_ID.toBase58(), DAMM_V2_PROGRAM_ID.toBase58(), JUPITER].some((p) => keys.has(p))) {
    return NextResponse.json({ error: "This relay only broadcasts Scrip Curve transactions." }, { status: 400 });
  }
  const required = tx.message.header.numRequiredSignatures;
  if (tx.signatures.slice(0, required).some((s) => s.every((b) => b === 0))) return NextResponse.json({ error: "The transaction is not fully signed." }, { status: 400 });
  const conn = connection();
  const raw = tx.serialize();
  // A wallet that takes longer than about a minute to approve hands back a transaction the
  // network no longer accepts. Said in those words, because "blockhash" means nothing to a person.
  const expired = "Your wallet took longer than about a minute to approve, and the network only accepts a signed transaction for about that long. Nothing moved: press the button again and approve within a minute.";
  try {
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0 });
    const height = await conn.getBlockHeight("confirmed");
    // The same signed bytes again while the network has not seen them: a dropped transaction is
    // never reported, and this is the only way it still lands inside its minute.
    const confirmed = await confirmSignature(conn, sig, height + 150, "confirmed", () => conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }));
    if (!confirmed.ok) return NextResponse.json({ error: /expired/.test(confirmed.why) ? expired : `${confirmed.why} Nothing moved.` }, { status: 422 });
    return NextResponse.json({ signature: sig });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if (/blockhash not found|BlockhashNotFound|block height exceeded/i.test(why)) return NextResponse.json({ error: expired }, { status: 422 });
    return NextResponse.json({ error: `Refused (${why.slice(0, 200)}).` }, { status: 422 });
  }
}
