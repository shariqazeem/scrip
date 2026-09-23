import { Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { buildClaim, type ClaimParams } from "@/lib/claim/build";
import { connection } from "@/lib/solana/connection";
import { relayerKeypair } from "@/lib/relayer";

export const dynamic = "force-dynamic";

/**
 * BUILD A CLAIM — fee-sponsored, so an empty wallet can take a first position.
 *
 *     [open_book (if the claimer has none), claim_payout]
 *
 * The relayer is the fee payer, but it does NOT sign here. It used to, and that is why
 * Phantom blocked every claim: Phantom's Lighthouse guard adds assertion instructions before
 * the wallet signs, and it cannot do that to a transaction that already carries another
 * signature, so it flags it instead. The order Phantom asks for is the wallet first, other
 * signers afterwards — so this returns the claim unsigned, the wallet signs it (and the claim
 * key, for a link), and /api/relay checks it is still this claim before the relayer co-signs.
 */
export async function POST(req: NextRequest) {
  let body: ClaimParams;
  try {
    body = (await req.json()) as ClaimParams;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }

  const relayer = relayerKeypair();
  if (!relayer) return NextResponse.json({ error: "Claims are not sponsored on this deployment (no relayer key)." }, { status: 503 });

  const conn = connection();
  const built = await buildClaim(conn, body, relayer.publicKey);
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: built.status });

  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }
  const tx = new Transaction({ feePayer: relayer.publicKey, blockhash, lastValidBlockHeight }).add(...built.value.instructions);
  return NextResponse.json({
    transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    needsClaimKey: built.value.needsClaimKey,
    opensBook: built.value.opensBook,
    asset: built.value.asset,
    escrowRaw: built.value.escrowRaw.toString(),
  });
}
