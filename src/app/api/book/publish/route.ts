import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { forgetLive } from "@/lib/book/live";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { indexBooks } from "@/lib/ledger/indexer";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/** Publish or unpublish the signed-in owner's book page. Opt-in, reversible, off chain. */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { published?: unknown };
  try {
    body = (await req.json()) as { published?: unknown };
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const published = body.published === true ? 1 : 0;
  let row = (await db.select({ id: books.id, slug: books.slug }).from(books).where(eq(books.owner, owner)).limit(1))[0];
  if (!row) {
    await indexBooks();
    row = (await db.select({ id: books.id, slug: books.slug }).from(books).where(eq(books.owner, owner)).limit(1))[0];
  }
  if (!row) return NextResponse.json({ error: "Open a register first." }, { status: 404 });
  await db.update(books).set({ published }).where(eq(books.id, row.id));
  forgetLive(owner);
  return NextResponse.json({ published: published === 1, slug: row.slug });
}
