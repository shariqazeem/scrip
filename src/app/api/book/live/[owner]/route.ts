import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { liveView } from "@/lib/book/live";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/**
 * THE LIVE VIEW, polled. The owner may read their own; anyone may read a book its owner
 * published. Anything else is not found, not forbidden: a private book should not confirm
 * its existence to a stranger.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  const me = await currentOwner();
  if (me !== owner) {
    const row = (await db.select({ published: books.published }).from(books).where(eq(books.owner, owner)).limit(1))[0];
    if (!row || row.published !== 1) return NextResponse.json({ error: "No such book." }, { status: 404 });
  }
  const view = await liveView(owner);
  if (!view.ok) return NextResponse.json({ error: view.why }, { status: 503 });
  return NextResponse.json(view.value, { headers: { "cache-control": "no-store" } });
}
