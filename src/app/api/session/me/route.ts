import { NextResponse } from "next/server";
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
  return NextResponse.json({ owner: await currentOwner() });
}
