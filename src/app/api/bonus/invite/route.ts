import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/bonus";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/** ADD A WALLET TO THE WELCOME-BONUS INVITES — operators only, by signed session. */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!isOperator(owner)) return NextResponse.json({ error: "Only an operator can invite." }, { status: 403 });
  let body: { address?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let address: string;
  try {
    const k = new PublicKey(String(body.address ?? "").trim());
    if (!PublicKey.isOnCurve(k.toBytes())) throw new Error("off curve");
    address = k.toBase58();
  } catch {
    return NextResponse.json({ error: "That is not a wallet address." }, { status: 400 });
  }
  const label = String(body.label ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  await db.insert(invites).values({ address, label, addedBy: owner! }).onConflictDoNothing();
  return NextResponse.json({ ok: true, address });
}
