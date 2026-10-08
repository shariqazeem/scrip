import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { askToJoin, openPlan } from "@/lib/plan/open";
import { membershipsOf } from "@/lib/plan/read";
import { currentOwner } from "@/lib/session/server";
import { connection } from "@/lib/solana/connection";
import { bookPda } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * ASK TO JOIN SCRIP'S PLAN — the signed-in wallet asks to be invited. The address is the
 * session's, never the request's; nothing moves and nothing is signed. The sponsor reads the
 * queue on their Plans page and invites with their own signature.
 */
const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const me = await currentOwner();
  if (!me) return fail("Sign in first.", 401);
  let plan: unknown;
  try {
    ({ plan } = (await req.json()) as { plan?: unknown });
  } catch {
    return fail("That request could not be read.", 400);
  }
  const open = await openPlan();
  if (!open || open.pda !== plan) return fail("This Plan is not taking requests right now.");
  if (open.sponsor === me) return fail("A sponsor cannot match their own saves.");

  const memberships = await membershipsOf(me);
  if (!memberships.ok) return fail(memberships.why, 503);
  const mine = memberships.value.find((r) => r.plan.pda === open.pda);
  if (mine) return fail(mine.member.status === "active" ? "You are already in this Plan." : "You are already invited: join it on your savings page.");

  // A Plan matches automatic saves, so a request comes from somebody who saves every payment.
  try {
    const book = await connection().getAccountInfo(bookPda(new PublicKey(me)), "confirmed");
    if (!book) return fail("Start saving every payment first: a Plan matches automatic saves.");
  } catch {
    return fail("Your savings could not be read just now. Try again in a moment.", 503);
  }

  return NextResponse.json({ askedAt: await askToJoin(open.pda, me) });
}
