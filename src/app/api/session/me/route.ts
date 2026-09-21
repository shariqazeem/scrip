import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the chrome.
 *
 * The rail is a client component mounted in the ROOT layout, and reading a cookie there would
 * make every page dynamic — including the landing, which should be static and is the first
 * thing a stranger sees. So the chrome asks, and renders an honest "still asking" state until
 * the answer arrives. Pages that need the owner for DATA read the cookie directly on the
 * server, where the answer is already present by the time anything renders.
 */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ owner: null, handle: null, kind: null });
  // The handle and its kind from the cache: a person's register, or an organisation's.
  const [row] = await db.select({ slug: books.slug, kind: books.kind }).from(books).where(eq(books.owner, owner)).limit(1);
  return NextResponse.json({ owner, handle: row?.slug ?? null, kind: row ? (row.kind === "org" ? "org" : "person") : null });
}
