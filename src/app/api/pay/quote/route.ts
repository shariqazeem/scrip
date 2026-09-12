import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { allocate } from "@/lib/allocator";
import { ASSETS } from "@/lib/assets/registry";
import { connection } from "@/lib/book/read-book";
import { readPolicyOf } from "@/lib/book/read-book";
import { toQuoteView } from "@/lib/pay/quote";
import { defaultPolicy } from "@/lib/policy";
import type { Price } from "@/lib/pyth/price";
import type { Outcome } from "@/lib/outcome";
import { readPrice } from "@/lib/pyth/read";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/**
 * QUOTE A PAYOUT — the server does the allocating, and this is the rule not an optimisation.
 *
 * Weights come from the RECIPIENT's signed policy. If the browser could choose them, the
 * payer could choose them, and the one sentence the product rests on — "a payer may constrain
 * the asset set but never the weights" — would be a convention rather than a rule.
 *
 * It holds as a whole. A price too old to settle against, an asset with no feed pinned, a
 * constraint that leaves nothing the policy allows: each of those refuses the quote and says
 * why, rather than returning three legs where four were called for.
 */
export async function POST(req: NextRequest) {
  if (!(await currentOwner())) {
    return NextResponse.json({ error: "Sign in to quote a payout." }, { status: 401 });
  }

  let body: { recipient?: unknown; dollars?: unknown; constraint?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("That request could not be read.");
  }
  const { recipient, dollars, constraint } = body;
  if (typeof recipient !== "string") return bad("Name a recipient.");
  if (typeof dollars !== "number" || !Number.isFinite(dollars) || dollars <= 0) {
    return bad("Enter an amount greater than zero.");
  }
  // Six decimals is the whole precision of the unit. Anything finer is a number the rail
  // cannot carry, and silently truncating somebody's input is how a payment surprises them.
  const requestedBase = BigInt(Math.round(dollars * 1e6));

  let recipientKey: PublicKey;
  try {
    recipientKey = new PublicKey(recipient);
  } catch {
    return bad("That is not a Solana address.");
  }
  if (!PublicKey.isOnCurve(recipientKey.toBytes())) {
    // A PDA has no key, so nobody could ever spend what lands there. Paying one is burning.
    return bad("That address is a program account — nobody could spend what lands there.");
  }

  let allowed: string[] | null = null;
  if (Array.isArray(constraint) && constraint.length > 0) {
    allowed = constraint.filter((m): m is string => typeof m === "string");
  }

  const conn = connection();
  const now = Math.floor(Date.now() / 1000);

  const signed = await readPolicyOf(conn, recipientKey);
  const policy = signed ?? defaultPolicy();

  // Price only what this allocation could actually touch.
  const wanted = new Set(policy.legs.map((l) => l.mint));
  const prices = new Map<string, Outcome<Price>>();
  for (const asset of ASSETS) {
    if (!wanted.has(asset.mint)) continue;
    prices.set(asset.mint, await readPrice(conn, asset.price));
  }

  const allocation = allocate({
    requestedBase,
    policy,
    constraint: allowed,
    prices,
    now,
  });
  if (!allocation.ok) return NextResponse.json({ error: allocation.why }, { status: 422 });

  return NextResponse.json(
    toQuoteView(recipient, allocation.value, signed ? "signed" : "default"),
  );
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
