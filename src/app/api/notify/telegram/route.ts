import { type NextRequest, NextResponse } from "next/server";
import { botToken, linkFor } from "@/lib/notify/telegram";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/** The signed-in owner's Telegram link: linked, or the one-time code for /start. */
export async function GET(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (req.nextUrl.searchParams.get("owner") !== owner) return NextResponse.json({ error: "Not your register." }, { status: 403 });
  if (!botToken()) return NextResponse.json({ linked: false, code: null, configured: false });
  const link = await linkFor(owner);
  return NextResponse.json({ linked: !!link.chatId, code: link.chatId ? null : link.code, configured: true });
}
