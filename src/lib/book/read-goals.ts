import "server-only";

import { PublicKey } from "@solana/web3.js";
import { unpackAccount } from "@solana/spl-token";
import idlJson from "@/lib/anchor/webgold.json";
import { ASSETS } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { WEBGOLD_PROGRAM_ID, goalPda } from "@/lib/solana/program";
import { type GoalView, decodeGoal } from "./goals";
import { ataFor, tokenProgramFor } from "./payout-instructions";
import { connection } from "./read-book";

/**
 * READ AN OWNER'S GOALS, AND WHAT EACH ONE HOLDS.
 *
 * A goal's address depends on a slug the owner chose, so there is no list to derive it from —
 * the accounts have to be found rather than computed. One `getProgramAccounts` filtered by
 * the Goal discriminator AND the owner pubkey does it in a single call: the filter is narrow
 * enough that the RPC returns a handful of accounts rather than the program's whole state.
 *
 * What a goal HOLDS is its token balances, never a counter on the account. A counter beside a
 * balance is two lists that drift, and the one people read would be the wrong one.
 */

const GOAL_DISCRIMINATOR: number[] | null =
  (idlJson as { accounts?: Array<{ name: string; discriminator: number[] }> }).accounts?.find(
    (a) => a.name === "Goal",
  )?.discriminator ?? null;

export type GoalHolding = { readonly mint: string; readonly symbol: string; readonly amount: bigint };

export type GoalWithHoldings = GoalView & {
  readonly holdings: readonly GoalHolding[];
};

export async function readGoals(ownerAddress: string): Promise<Outcome<GoalWithHoldings[]>> {
  if (!GOAL_DISCRIMINATOR) return held("The committed IDL has no Goal account in it.");
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    return held("That is not a Solana address.");
  }

  const conn = connection();
  let accounts;
  try {
    accounts = await conn.getProgramAccounts(WEBGOLD_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: toBase58(Uint8Array.from(GOAL_DISCRIMINATOR)) } },
        { memcmp: { offset: 8, bytes: owner.toBase58() } },
      ],
    });
  } catch (err) {
    return held(
      `Could not read this book's goals (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const goals: GoalWithHoldings[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodeGoal(account.data);
    if (!decoded.ok) continue; // a goal we cannot read is skipped, never guessed at
    // Re-derive the address from the slug we just decoded. If it does not match, this is not
    // the account it claims to be, and reading it would be reading somebody else's goal.
    if (!goalPda(owner, decoded.value.slug).equals(pubkey)) continue;
    goals.push({ ...decoded.value, address: pubkey.toBase58(), holdings: [] });
  }
  if (goals.length === 0) return ok([]);

  // One batched read for every goal's token accounts.
  const wanted: Array<{ goal: number; asset: (typeof ASSETS)[number]; ata: PublicKey }> = [];
  for (let i = 0; i < goals.length; i += 1) {
    for (const asset of ASSETS) {
      wanted.push({
        goal: i,
        asset,
        ata: ataFor(new PublicKey(goals[i]!.address), asset),
      });
    }
  }
  let infos;
  try {
    infos = await conn.getMultipleAccountsInfo(
      wanted.map((w) => w.ata),
      "confirmed",
    );
  } catch {
    // The goals themselves read fine; their balances did not. Better to show the goals with
    // no holdings than to hide goals that exist.
    return ok(goals);
  }

  const holdings: GoalHolding[][] = goals.map(() => []);
  infos.forEach((info, i) => {
    if (!info) return;
    const w = wanted[i]!;
    try {
      const acct = unpackAccount(w.ata, info, tokenProgramFor(w.asset));
      if (acct.amount > 0n) {
        holdings[w.goal]!.push({ mint: w.asset.mint, symbol: w.asset.symbol, amount: acct.amount });
      }
    } catch {
      // An undecodable token account is not a balance. Skipped, never counted as zero.
    }
  });

  return ok(goals.map((g, i) => ({ ...g, holdings: holdings[i]! })));
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/**
 * WHICH GOAL SKIMS, when somebody has more than one.
 *
 * The program takes one goal account per release, so a rule is needed and it should be one a
 * person can predict without reading this file: THE MOST RECENTLY SET GOAL IS THE ACTIVE ONE.
 * Setting a goal is how you choose it, which is also how you switch.
 *
 * The alternative — splitting a skim across every goal — sounds fairer and is worse: it
 * multiplies the token accounts a release has to touch, and it means nobody can say what any
 * single arrival will do without enumerating accounts first.
 */
export async function readActiveGoal(owner: string): Promise<GoalWithHoldings | null> {
  const goals = await readGoals(owner);
  if (!goals.ok || goals.value.length === 0) return null;
  const withSkim = goals.value.filter((g) => g.skimBps > 0);
  if (withSkim.length === 0) return null;
  return withSkim.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}
