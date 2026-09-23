import { Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { buildClaim, type ClaimParams } from "@/lib/claim/build";
import { verifySponsoredClaim } from "@/lib/claim/verify";
import { confirmSignature } from "@/lib/solana/confirm";
import { connection } from "@/lib/solana/connection";
import { relayerKeypair } from "@/lib/relayer";

export const dynamic = "force-dynamic";

/**
 * CO-SIGN AND SEND A CLAIM. The wallet has signed first (and the claim key, for a link), which
 * is the order Phantom requires. The relayer signs last — so before it does, this rebuilds the
 * claim from the same parameters and checks that every instruction is either exactly the
 * claim Scrip built or a Lighthouse assertion Phantom added. See src/lib/claim/verify.ts for
 * why nothing else is allowed through: without that check the relayer would co-sign a
 * transfer out of itself for anyone who asked.
 *
 * Then every signature is verified against the message before anything is sent, and the
 * send runs a preflight simulation, so a claim that would fail costs the relayer nothing.
 */
export async function POST(req: NextRequest) {
  let body: { transactionBase64?: unknown; claim?: ClaimParams };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  if (typeof body.transactionBase64 !== "string") return NextResponse.json({ error: "No transaction." }, { status: 400 });
  if (!body.claim) return NextResponse.json({ error: "No claim to check the transaction against." }, { status: 400 });

  const relayer = relayerKeypair();
  if (!relayer) return NextResponse.json({ error: "Claims are not sponsored on this deployment (no relayer key)." }, { status: 503 });

  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(body.transactionBase64, "base64"));
  } catch {
    return NextResponse.json({ error: "The transaction could not be read." }, { status: 400 });
  }

  const conn = connection();
  // Always the sponsored claim: a self-paid claim never comes here, because the relayer has
  // nothing to sign in it — and it must never be tricked into rebuilding one and paying for it.
  const expected = await buildClaim(conn, body.claim, relayer.publicKey, "sponsored");
  if (!expected.ok) return NextResponse.json({ error: expected.why }, { status: expected.status });

  const checked = verifySponsoredClaim({ feePayer: tx.feePayer, relayer: relayer.publicKey, instructions: tx.instructions, expected: expected.value.instructions });
  if (!checked.ok) return NextResponse.json({ error: `This is not the claim Scrip built, so the relayer will not pay for it. ${checked.why}` }, { status: 400 });

  // Signs the message the wallet already signed: Transaction.from keeps the original compiled
  // message, so the wallet's and the claim key's signatures stay valid beside this one.
  tx.partialSign(relayer);
  let raw: Buffer;
  try {
    raw = tx.serialize(); // requireAllSignatures and verifySignatures: every one present and valid
  } catch {
    return NextResponse.json({ error: "A signature is missing or does not match the claim. Nothing moved." }, { status: 422 });
  }
  try {
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
    // Answer only once it has CONFIRMED. The button says "Claimed" when this returns, and the
    // page it opens reads the receipt — both were running ahead of the chain, which is how the
    // first claim under the new signing order was finalized while its receipt page said it did
    // not exist. A blockhash lives about 150 blocks, so that bounds the wait.
    const height = await conn.getBlockHeight("confirmed");
    const confirmed = await confirmSignature(conn, sig, height + 150);
    if (!confirmed.ok) return NextResponse.json({ error: `${confirmed.why} Nothing moved.` }, { status: 422 });
    return NextResponse.json({ signature: sig, guards: checked.value.guards, priorityLamports: checked.value.priorityLamports.toString() });
  } catch (err) {
    return NextResponse.json({ error: `The claim was refused (${err instanceof Error ? err.message.slice(0, 200) : String(err)}).` }, { status: 422 });
  }
}
