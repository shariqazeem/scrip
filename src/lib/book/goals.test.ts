/**
 * @vitest-environment node
 *
 * Node, not jsdom: `findProgramAddressSync` computes the wrong hash under jsdom's Uint8Array
 * realm. See instructions.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { assetBySymbol } from "@/lib/assets/registry";
import { MAX_SLUG_LEN, goalPda } from "@/lib/solana/program";
import { decodeWebgoldIx } from "./instructions";
import {
  MAX_GOAL_NAME_LEN,
  MAX_SKIM_BPS,
  setGoalIx,
  slugify,
  validateGoal,
  withdrawGoalIx,
} from "./goals";

const RUST = readFileSync(
  join(__dirname, "..", "..", "..", "anchor", "programs", "webgold", "src", "payout.rs"),
  "utf8",
);
const owner = Keypair.generate().publicKey;
const GOLD = assetBySymbol("GOLD")!;

const draft = (over: Partial<Parameters<typeof validateGoal>[0]> = {}) => ({
  slug: "a-laptop",
  name: "A laptop",
  targetBase: 1_500_000_000n,
  skimBps: 1000,
  ...over,
});

describe("the client mirrors the program's goal limits", () => {
  it("shares every constant", () => {
    const constant = (name: string) => {
      const m = new RegExp(`pub const ${name}: \\w+ = ([\\d_]+)`).exec(RUST);
      expect(m, `${name} is no longer declared in the program`).toBeTruthy();
      return Number(m![1]!.replace(/_/g, ""));
    };
    expect(MAX_SKIM_BPS).toBe(constant("MAX_SKIM_BPS"));
    expect(MAX_SLUG_LEN).toBe(constant("MAX_SLUG_LEN"));
    expect(MAX_GOAL_NAME_LEN).toBe(constant("MAX_GOAL_NAME_LEN"));
  });

  it("keeps the slug inside what a PDA seed can hold", () => {
    // The runtime caps a single seed at 32 bytes. A longer slug produces an address that
    // cannot be derived — an account nobody, its owner included, could find again.
    expect(MAX_SLUG_LEN).toBeLessThanOrEqual(32);
  });

  it("still has the program capping the skim, not only the client", () => {
    expect(RUST).toContain("pub const MAX_SKIM_BPS: u16 = 5_000;");
  });
});

describe("slugify", () => {
  it("makes a stable, seed-safe key from what somebody typed", () => {
    // Derived rather than generated, so the same goal named twice is the same goal.
    expect(slugify("A laptop")).toBe("a-laptop");
    expect(slugify("  Three months' runway!  ")).toBe("three-months-runway");
    expect(slugify("A laptop")).toBe(slugify("a LAPTOP"));
  });

  it("never exceeds the seed limit, however long the name", () => {
    const slug = slugify("x".repeat(200));
    expect(new TextEncoder().encode(slug).length).toBeLessThanOrEqual(MAX_SLUG_LEN);
  });

  it("produces an empty slug from a name with nothing addressable in it", () => {
    // Refused by validateGoal rather than silently becoming a goal called "".
    expect(slugify("！！！")).toBe("");
    expect(validateGoal(draft({ slug: "" })).ok).toBe(false);
  });
});

describe("validateGoal", () => {
  it("accepts an ordinary goal", () => {
    expect(validateGoal(draft()).ok).toBe(true);
  });

  it("refuses a skim above the program's ceiling", () => {
    expect(validateGoal(draft({ skimBps: MAX_SKIM_BPS })).ok).toBe(true);
    const over = validateGoal(draft({ skimBps: MAX_SKIM_BPS + 1 }));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.why).toMatch(/more than 50%/);
  });

  it("refuses a negative skim or a negative target", () => {
    expect(validateGoal(draft({ skimBps: -1 })).ok).toBe(false);
    expect(validateGoal(draft({ targetBase: -1n })).ok).toBe(false);
  });

  it("allows a goal with no target — a habit rather than a purchase", () => {
    expect(validateGoal(draft({ targetBase: 0n })).ok).toBe(true);
  });

  it("refuses a name longer than the account reserves room for", () => {
    expect(validateGoal(draft({ name: "x".repeat(MAX_GOAL_NAME_LEN + 1) })).ok).toBe(false);
  });
});

describe("set_goal", () => {
  it("round-trips every field, because a missing name encodes as zero", () => {
    // The silent-zero hazard again: `skimBps` instead of `skim_bps` would create a goal that
    // takes 0% of every arrival and looks exactly like one that works.
    const ix = setGoalIx(owner, draft());
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const d = decodeWebgoldIx(Buffer.from(ix.value.data))?.data as {
      slug: string;
      name: string;
      target_base: { toString(): string };
      skim_bps: number;
    };
    expect(d.slug).toBe("a-laptop");
    expect(d.name).toBe("A laptop");
    expect(d.target_base.toString()).toBe("1500000000");
    expect(d.skim_bps).toBe(1000);
    expect(d.skim_bps).toBeGreaterThan(0);
  });

  it("addresses the goal by its owner and its slug", () => {
    const ix = setGoalIx(owner, draft());
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    expect(ix.value.keys[0]!.pubkey.equals(goalPda(owner, "a-laptop"))).toBe(true);
    expect(ix.value.keys[1]!.isSigner).toBe(true);
  });

  it("refuses to build an instruction the program would reject", () => {
    expect(setGoalIx(owner, draft({ skimBps: 9999 })).ok).toBe(false);
  });
});

describe("withdraw_goal", () => {
  it("sends to the OWNER's own account, derived rather than passed in", () => {
    // The destination is not a parameter. There is nothing a caller could put here to make a
    // goal pay somebody else, and the program checks it again anyway.
    const ix = withdrawGoalIx(owner, "a-laptop", [{ asset: GOLD, amount: 25_000n }]);
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const goal = goalPda(owner, "a-laptop");
    expect(ix.value.keys[0]!.pubkey.equals(goal)).toBe(true);
    expect(ix.value.keys[1]!.pubkey.equals(owner)).toBe(true);
    // [mint, from, to, program]
    expect(ix.value.keys[2]!.pubkey.equals(new PublicKey(GOLD.mint))).toBe(true);
    expect(decodeWebgoldIx(Buffer.from(ix.value.data))?.name).toBe("withdraw_goal");
  });

  it("refuses to withdraw nothing", () => {
    expect(withdrawGoalIx(owner, "a-laptop", []).ok).toBe(false);
  });
});

describe("goalPda", () => {
  it("refuses a slug that cannot be a seed, rather than deriving an unreachable address", () => {
    expect(() => goalPda(owner, "")).toThrow(/1 to 32 bytes/);
    expect(() => goalPda(owner, "x".repeat(33))).toThrow(/1 to 32 bytes/);
  });

  it("gives different slugs different addresses", () => {
    expect(goalPda(owner, "a-laptop").equals(goalPda(owner, "runway"))).toBe(false);
  });
});
