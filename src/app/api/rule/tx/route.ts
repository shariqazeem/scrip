import { PublicKey, Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { loadBook, usdcMintFor } from "@/lib/book/read-book";
import { validateSlug } from "@/lib/handle";
import { changeRuleIxs, disableRuleIxs, enableRuleIxs, openBookIx, pauseIxs, resumeIxs, setAssetIx, topUpAllowanceIxs, withdrawFloatIx, depositFloatIx, openUsdcIfMissing } from "@/lib/rule/instructions";
import { type RuleTerms, validateRule } from "@/lib/rule/slice";
import { currentOwner } from "@/lib/session/server";
import { cluster } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * BUILD A RULE TRANSACTION for the signed-in owner. Every instruction is data the browser
 * could build itself; this route exists so the blockhash comes from a server RPC and so the
 * composition rules (approve BEFORE enable, revoke BEFORE disable) live in exactly one place.
 * The owner signs in their wallet; this route cannot.
 */
type Body = {
  action?: "open" | "start" | "enable" | "change" | "pause" | "resume" | "disable" | "allowance" | "float" | "withdraw" | "asset";
  slug?: string;
  assetMint?: string;
  termsVersion?: number;
  terms?: { rateBps: number; escalateBps: number; floorUsdc: string; capUsdc: string; toleranceBps: number };
  allowanceUsdc?: string;
  floatLamports?: string;
  lamports?: string;
  /** "person" (default) or "org": who the handle names. */
  kind?: string;
};

function terms(t: Body["terms"]): RuleTerms | null {
  if (!t) return null;
  try {
    const v = validateRule({ rateBps: t.rateBps, escalateBps: t.escalateBps, floorUsdc: BigInt(t.floorUsdc), capUsdc: BigInt(t.capUsdc), toleranceBps: t.toleranceBps });
    return v.ok ? v.value : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const ownerKey = new PublicKey(owner);
  const view = await loadBook(owner);
  if (!view.ok) return NextResponse.json({ error: view.why }, { status: 503 });
  const usdcMint = usdcMintFor(view.value.book);
  const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });

  let ixs;
  switch (body.action) {
    case "open": {
      if (view.value.book) return bad("This wallet already has a register.");
      const slug = validateSlug(body.slug ?? "");
      if (!slug.ok) return bad(slug.why);
      const asset = body.assetMint ? assetByMint(body.assetMint) : defaultAsset();
      if (!asset || !asset.ruleEligible) return bad("Choose an asset from the registry.");
      const tv = Number(body.termsVersion ?? 0);
      if (asset.issuer.name.includes("xStocks") && tv < 1) return bad("This asset needs the eligibility attestation.");
      const ix = openBookIx({ owner: ownerKey, slug: slug.value, asset, usdcMint, termsVersion: tv, kind: body.kind === "org" ? "org" : "person" });
      if (!ix.ok) return bad(ix.why);
      ixs = [ix.value];
      break;
    }
    case "start": {
      // ONE SIGNATURE: open the book, approve the delegate, deposit the float, turn the rule
      // on. The delegate is the Book PDA, derivable before the account exists, and the
      // program checks the approve INSIDE enable_rule, which runs last.
      if (view.value.book) return bad("This wallet already has a register.");
      const slug = validateSlug(body.slug ?? "");
      if (!slug.ok) return bad(slug.why);
      const asset = body.assetMint ? assetByMint(body.assetMint) : defaultAsset();
      if (!asset || !asset.ruleEligible) return bad("Choose an asset from the registry.");
      const tv = Number(body.termsVersion ?? 0);
      if (asset.issuer.name.includes("xStocks") && tv < 1) return bad("This asset needs the eligibility attestation.");
      const t = terms(body.terms);
      if (!t) return bad("Those terms are out of range.");
      const open = openBookIx({ owner: ownerKey, slug: slug.value, asset, usdcMint, termsVersion: tv });
      if (!open.ok) return bad(open.why);
      const r = enableRuleIxs({ owner: ownerKey, usdcMint, terms: t, allowanceUsdc: BigInt(body.allowanceUsdc ?? "0"), floatLamports: BigInt(body.floatLamports ?? "0") });
      if (!r.ok) return bad(r.why);
      // A wallet that has never held USDC gets its USDC account in the same signature.
      ixs = [...openUsdcIfMissing(ownerKey, usdcMint, view.value.usdc.exists), open.value, ...r.value];
      break;
    }
    case "asset": {
      if (!view.value.book) return bad("Open a register first.");
      const asset = body.assetMint ? assetByMint(body.assetMint) : null;
      if (!asset || !asset.ruleEligible) return bad("Choose an asset from the registry.");
      const tv = Number(body.termsVersion ?? 0);
      if (asset.issuer.name.includes("xStocks") && tv < 1) return bad("This asset needs the eligibility attestation.");
      const ix = setAssetIx({ owner: ownerKey, asset, usdcMint, termsVersion: tv });
      if (!ix.ok) return bad(ix.why);
      ixs = [ix.value];
      break;
    }
    case "enable": {
      if (!view.value.book) return bad("Open a register first.");
      const t = terms(body.terms);
      if (!t) return bad("Those terms are out of range.");
      const r = enableRuleIxs({ owner: ownerKey, usdcMint, terms: t, allowanceUsdc: BigInt(body.allowanceUsdc ?? "0"), floatLamports: BigInt(body.floatLamports ?? "0") });
      if (!r.ok) return bad(r.why);
      // A register opened by a claim has no USDC account yet; the same signature opens it.
      ixs = [...openUsdcIfMissing(ownerKey, usdcMint, view.value.usdc.exists), ...r.value];
      break;
    }
    case "change": {
      const t = terms(body.terms);
      if (!t) return bad("Those terms are out of range.");
      const r = changeRuleIxs(ownerKey, usdcMint, t);
      if (!r.ok) return bad(r.why);
      ixs = r.value;
      break;
    }
    case "pause":
      ixs = pauseIxs(ownerKey, usdcMint);
      break;
    case "resume": {
      const current = view.value.book?.rule;
      if (!current || !current.enabled) return bad("The rule is not on.");
      const t = terms(body.terms) ?? {
        rateBps: current.rateBps,
        escalateBps: current.escalateBps,
        floorUsdc: current.floorUsdc,
        capUsdc: current.capUsdc,
        toleranceBps: current.toleranceBps,
      };
      const r = resumeIxs({ owner: ownerKey, usdcMint, terms: t, allowanceUsdc: BigInt(body.allowanceUsdc ?? "0") });
      if (!r.ok) return bad(r.why);
      ixs = r.value;
      break;
    }
    case "disable": {
      const r = disableRuleIxs(ownerKey, usdcMint);
      if (!r.ok) return bad(r.why);
      ixs = r.value;
      break;
    }
    case "allowance": {
      const r = topUpAllowanceIxs(ownerKey, usdcMint, BigInt(body.allowanceUsdc ?? "0"));
      if (!r.ok) return bad(r.why);
      ixs = r.value;
      break;
    }
    case "float": {
      const lamports = BigInt(body.lamports ?? "0");
      if (lamports <= 0n) return bad("Enter an amount greater than zero.");
      ixs = [depositFloatIx(ownerKey, lamports)];
      break;
    }
    case "withdraw": {
      const r = withdrawFloatIx(ownerKey, BigInt(body.lamports ?? "0"));
      if (!r.ok) return bad(r.why);
      ixs = [r.value];
      break;
    }
    default:
      return bad("Unknown action.");
  }

  const conn = connection();
  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    const program = await conn.getAccountInfo(SCRIP_PROGRAM_ID, "confirmed");
    if (!program?.executable) return NextResponse.json({ error: `The Scrip program is not deployed on ${cluster()} yet. Nothing was sent.` }, { status: 503 });
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }
  const tx = new Transaction({ feePayer: ownerKey, blockhash, lastValidBlockHeight }).add(...ixs);
  return NextResponse.json({
    transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    blockhash,
    lastValidBlockHeight,
    instructions: ixs.length,
  });
}
