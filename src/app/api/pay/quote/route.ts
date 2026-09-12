import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { allocate, named } from "@/lib/allocator";
import { ASSETS, assetByMint } from "@/lib/assets/registry";
import { connection } from "@/lib/book/read-book";
import { readPolicyOf } from "@/lib/book/read-book";
import { readActiveGoal } from "@/lib/book/read-goals";
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

  let body: {
    recipient?: unknown;
    dollars?: unknown;
    constraint?: unknown;
    mode?: unknown;
    mint?: unknown;
    quantity?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return bad("That request could not be read.");
  }
  const { recipient, dollars, constraint, mode, mint, quantity } = body;
  if (typeof recipient !== "string") return bad("Name a recipient.");

  /**
   * A NAMED GIFT SKIPS ALLOCATION ENTIRELY. Somebody sending 0.2 grams of gold means 0.2
   * grams of gold, and only unspecified value converts. It is the same instruction, the same
   * escrow and the same receipt as a payout — the difference is that the recipient's policy
   * never gets consulted, because nothing was left for it to decide.
   */
  const isNamed = mode === "named";
  if (isNamed) {
    if (typeof mint !== "string") return bad("Name the asset being sent.");
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      return bad("Enter a quantity greater than zero.");
    }
  } else if (typeof dollars !== "number" || !Number.isFinite(dollars) || dollars <= 0) {
    // Six decimals is the whole precision of the unit. Anything finer is a number the rail
    // cannot carry, and silently truncating somebody's input is how a payment surprises them.
    return bad("Enter an amount greater than zero.");
  }

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

  if (isNamed) {
    const asset = assetByMint(mint as string);
    if (!asset) return bad("Webgold does not know how to settle that asset.");
    const price = await readPrice(conn, asset.price);
    if (!price.ok) return NextResponse.json({ error: price.why }, { status: 422 });
    const amount = BigInt(Math.round((quantity as number) * 10 ** asset.decimals));
    const gift = named(asset.mint, amount, price.value, now);
    if (!gift.ok) return NextResponse.json({ error: gift.why }, { status: 422 });
    // "named" rather than "signed" or "default": no policy was consulted, and saying either
    // of the others would claim a decision nobody made. A goal still skims it, though — a
    // gift is an arrival like any other.
    return NextResponse.json(
      toQuoteView(recipient, gift.value, "named", await activeGoal(recipient)),
    );
  }

  const requestedBase = BigInt(Math.round((dollars as number) * 1e6));
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
    toQuoteView(
      recipient,
      allocation.value,
      signed ? "signed" : "default",
      await activeGoal(recipient),
    ),
  );
}

/** The recipient's active goal, flattened for the wire. Null when nothing is skimming. */
async function activeGoal(recipient: string) {
  const goal = await readActiveGoal(recipient);
  return goal ? { address: goal.address, name: goal.name, skimBps: goal.skimBps } : null;
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
