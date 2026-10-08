import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { acceptMemberIx, closePlanIx, removeMemberIx, validateTerms } from "@/lib/plan/instructions";
import { INVITES_PER_TX, buildInvites, buildOpenPlan, buildSingle, buildTopUp } from "@/lib/plan/build";
import { planAt } from "@/lib/plan/read";
import { resolveRecipient } from "@/lib/org/resolve";
import { currentOwner } from "@/lib/session/server";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * A PLAN, ONE ACTION AT A TIME — open, top up, invite, join, remove, close. The signed-in wallet is the
 * signer of every transaction built here: the sponsor for everything but joining, the member
 * for joining. Each comes back unsigned; the wallet signs and sends it.
 */
type Body = {
  action?: unknown;
  assetMint?: unknown;
  budgetUsd?: unknown;
  matchBps?: unknown;
  capUsd?: unknown;
  name?: unknown;
  plan?: unknown;
  to?: unknown;
  owner?: unknown;
};

const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const me = await currentOwner();
  if (!me) return fail("Sign in first.", 401);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("That request could not be read.", 400);
  }
  const signer = new PublicKey(me);

  if (body.action === "open") {
    const asset = typeof body.assetMint === "string" ? assetByMint(body.assetMint) : defaultAsset();
    // A match is priced on chain like an automatic save, so only a stock a keeper can price.
    if (!asset || !asset.ruleEligible || asset.unpriced) return fail("Choose a stock that can be saved automatically.");
    const budget = Number(body.budgetUsd);
    if (!Number.isFinite(budget) || budget < 1) return fail("Put at least $1 in the Plan to start.");
    const cap = Number(body.capUsd);
    const terms = { matchBps: Math.round(Number(body.matchBps)), monthlyCapUsdc: BigInt(Math.round((Number.isFinite(cap) ? cap : 0) * 1e6)), defaultRateBps: 1000, escalateBps: 0 };
    const bad = validateTerms(terms);
    if (bad) return fail(bad);
    const built = await buildOpenPlan({ sponsor: signer, asset, budgetUsdc: BigInt(Math.round(budget * 1e6)), terms, name: typeof body.name === "string" ? body.name : "" });
    if (!built.ok) return fail(built.why);
    return NextResponse.json(built.value);
  }

  // Every other action names an existing Plan.
  if (typeof body.plan !== "string") return fail("Which Plan?", 400);
  const found = await planAt(body.plan);
  if (!found.ok) return fail(found.why);
  if (!found.value) return fail("That Plan does not exist, or has closed.");
  const plan = found.value;
  const planKey = new PublicKey(plan.pda);
  const asset = assetByMint(plan.asset);
  if (!asset) return fail("That Plan pays in a stock this site does not know.");

  if (body.action === "accept") {
    const ix = acceptMemberIx({ owner: signer, plan: planKey });
    if (!ix.ok) return fail(ix.why);
    const built = await buildSingle({ signer, ix: ix.value, what: "Joining the Plan" });
    return built.ok ? NextResponse.json(built.value) : fail(built.why);
  }

  if (plan.sponsor !== me) return fail("Only the wallet that opened this Plan can change it.", 403);

  if (body.action === "topup") {
    const amount = Number(body.budgetUsd);
    if (!Number.isFinite(amount) || amount < 1) return fail("Add at least $1.");
    const id = releaseIdFromHex(plan.planId);
    if (!id.ok) return fail(id.why);
    const built = await buildTopUp({ sponsor: signer, planId: id.value, asset, amountUsdc: BigInt(Math.round(amount * 1e6)), name: plan.name });
    return built.ok ? NextResponse.json(built.value) : fail(built.why);
  }

  if (body.action === "invite") {
    const parts = String(body.to ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return fail("Name at least one person: a name like @ayesha, or a wallet address.");
    if (parts.length > INVITES_PER_TX) return fail(`At most ${INVITES_PER_TX} people per signature; send the rest next.`);
    const owners: PublicKey[] = [];
    for (const p of parts) {
      const r = await resolveRecipient(p, asset);
      if (!r.ok) return fail(`${p}: ${r.why}`);
      if (r.value.owner === me) return fail("A sponsor cannot match their own saves.");
      if (!owners.some((o) => o.toBase58() === r.value.owner)) owners.push(new PublicKey(r.value.owner));
    }
    const built = await buildInvites({ sponsor: signer, plan: planKey, owners });
    return built.ok ? NextResponse.json({ ...built.value, invited: owners.map((o) => o.toBase58()) }) : fail(built.why);
  }

  if (body.action === "remove") {
    if (typeof body.owner !== "string") return fail("Whom to remove?", 400);
    let owner: PublicKey;
    try {
      owner = new PublicKey(body.owner);
    } catch {
      return fail("That is not a wallet address.", 400);
    }
    const ix = removeMemberIx({ sponsor: signer, plan: planKey, owner });
    if (!ix.ok) return fail(ix.why);
    const built = await buildSingle({ signer, ix: ix.value, what: "Removing the member" });
    return built.ok ? NextResponse.json(built.value) : fail(built.why);
  }

  if (body.action === "close") {
    if (plan.members > 0) return fail("Remove every member first. A Plan closes only when nobody is left in it.");
    const id = releaseIdFromHex(plan.planId);
    if (!id.ok) return fail(id.why);
    const ix = closePlanIx({ sponsor: signer, planId: id.value, asset });
    if (!ix.ok) return fail(ix.why);
    const built = await buildSingle({ signer, ix: ix.value, what: "Closing the Plan" });
    return built.ok ? NextResponse.json(built.value) : fail(built.why);
  }

  return fail("Unknown action.", 400);
}
