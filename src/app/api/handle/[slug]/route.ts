import { NextResponse } from "next/server";
import { validateSlug } from "@/lib/handle";
import { resolveHandle } from "@/lib/book/read-book";

export const dynamic = "force-dynamic";

/** Is this handle taken, and by whom. Public: a handle is a URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = validateSlug(slug);
  if (!v.ok) return NextResponse.json({ error: v.why }, { status: 400 });
  const owner = await resolveHandle(v.value);
  if (!owner.ok) return NextResponse.json({ error: owner.why }, { status: 503 });
  return NextResponse.json({ slug: v.value, owner: owner.value, available: owner.value === null });
}
