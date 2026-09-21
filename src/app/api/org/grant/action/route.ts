import { PublicKey, Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { readGrantAt } from "@/lib/book/read-grant";
import { closeGrantIx, revokeGrantIx } from "@/lib/grant/instructions";
import { currentOwner } from "@/lib/session/server";
import { connection } from "@/lib/solana/connection";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/** Revoke or close a grant: a legacy transaction the payer signs in the browser. */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { pda?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let pda: PublicKey;
  try {
    pda = new PublicKey(String(body.pda ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a grant address." }, { status: 400 });
  }
  const g = await readGrantAt(pda);
  if (!g.ok) return NextResponse.json({ error: g.why }, { status: 503 });
  if (!g.value) return NextResponse.json({ error: "There is no grant at that address." }, { status: 404 });
  if (g.value.payer !== owner) return NextResponse.json({ error: "Only the payer may do this." }, { status: 403 });
  if (!g.value.asset_) return NextResponse.json({ error: "The grant's asset is not on the registry." }, { status: 422 });
  const id = releaseIdFromHex(g.value.grantId);
  if (!id.ok) return NextResponse.json({ error: id.why }, { status: 422 });
  const input = { payer: new PublicKey(owner), grantId: id.value, asset: g.value.asset_ };
  const ix = body.action === "revoke" ? revokeGrantIx(input) : body.action === "close" ? closeGrantIx(input) : null;
  if (!ix) return NextResponse.json({ error: "The action is revoke or close." }, { status: 400 });
  if (!ix.ok) return NextResponse.json({ error: ix.why }, { status: 422 });
  const conn = connection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: new PublicKey(owner), blockhash, lastValidBlockHeight }).add(ix.value);
  return NextResponse.json({ transactionBase64: tx.serialize({ requireAllSignatures: false }).toString("base64") });
}
