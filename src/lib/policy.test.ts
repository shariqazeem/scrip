import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { assetBySymbol } from "@/lib/assets/registry";
import {
  MAX_DRIFT_BPS,
  MAX_LEGS,
  POLICY_RULES,
  TOTAL_BPS,
  defaultPolicy,
  parsePolicy,
  serializePolicy,
  targetOf,
  validatePolicy,
} from "./policy";

const RUST = readFileSync(
  join(__dirname, "..", "..", "anchor", "programs", "webgold", "src", "lib.rs"),
  "utf8",
);

const mint = (n: number) => new PublicKey(new Uint8Array(32).fill(n)).toBase58();
const legs = (...pairs: Array<[string, number]>) => pairs.map(([m, bps]) => ({ mint: m, bps }));

/**
 * THE CLIENT AND THE PROGRAM ARE TWO COPIES OF ONE MONEY RULE.
 *
 * The client copy exists so a person is told "these do not add up to 100%" while editing,
 * instead of by a failed transaction they paid for. The cost of that convenience is a second
 * place the rule can change, and a rule that holds in only one of two places is worse than a
 * rule in one: the client silently removes a choice the program would have honoured, or lets
 * a user pay for a transaction that was never going to land.
 *
 * These tests read the Rust source directly. They cannot be satisfied by updating a copy.
 */
describe("the client mirrors the program", () => {
  it("shares every constant", () => {
    const constant = (name: string) => {
      const m = new RegExp(`pub const ${name}: \\w+ = ([\\d_]+)`).exec(RUST);
      expect(m, `${name} is no longer declared in the program`).toBeTruthy();
      return Number(m![1]!.replace(/_/g, ""));
    };
    expect(TOTAL_BPS).toBe(constant("TOTAL_BPS"));
    expect(MAX_LEGS).toBe(constant("MAX_LEGS"));
    expect(MAX_DRIFT_BPS).toBe(constant("MAX_DRIFT_BPS"));
  });

  it("names every error `Policy::validated` can raise, and invents none", () => {
    /**
     * It reads the VALIDATOR'S OWN BODY, not the error enum. The first version of this test
     * compared against the whole enum and broke the moment the payout instructions landed,
     * because it was really maintaining a hand-written list of exclusions — which is the
     * defect shape it exists to prevent, wearing a test's clothes.
     *
     * Scanning the function means a rule added to the program forces a rule here, and a rule
     * belonging to some other instruction is simply not in scope.
     */
    const body = /pub fn validated\(self\) -> Result<Self> \{([\s\S]*?)\n    \}/.exec(RUST)?.[1];
    expect(body, "Policy::validated is no longer where it was").toBeTruthy();
    const raised = new Set([...body!.matchAll(/WebgoldError::(\w+)/g)].map((m) => m[1]!));
    expect(raised.size).toBeGreaterThan(4);

    // The ONE exclusion, and it is about arithmetic rather than about a mix somebody typed:
    // the program accumulates weights in a u32 so eight u16 legs cannot wrap onto the target.
    // JavaScript numbers have no such wrap, so there is no client-side equivalent to mirror.
    raised.delete("PolicyWeightsOverflow");
    expect([...POLICY_RULES].sort()).toEqual([...raised].sort());
  });

  it("still has the program enforcing the sum, not only the client", () => {
    // The client check is a courtesy. If this line ever leaves the program, a policy that
    // does not add up becomes a thing a crafted transaction can write.
    expect(RUST).toContain("require!(total == TOTAL_BPS as u32, WebgoldError::PolicyWeightsWrong)");
  });
});

describe("validatePolicy", () => {
  it("accepts the product's real default", () => {
    expect(validatePolicy(defaultPolicy()).ok).toBe(true);
  });

  it("refuses weights that do not add up to exactly 100%", () => {
    const under = validatePolicy({ legs: legs([mint(1), 7000], [mint(2), 2999]), driftBps: 500 });
    expect(under.ok).toBe(false);
    if (under.ok) return;
    // The sentence is the thing a person reads while they are still editing.
    expect(under.why).toBe("These add up to 99.99%, not 100%.");

    expect(validatePolicy({ legs: legs([mint(1), 7000], [mint(2), 3001]), driftBps: 0 }).ok).toBe(false);
  });

  it("accepts a single leg at the full weight", () => {
    expect(validatePolicy({ legs: legs([mint(1), 10_000]), driftBps: 0 }).ok).toBe(true);
  });

  it("refuses an empty mix", () => {
    expect(validatePolicy({ legs: [], driftBps: 0 }).ok).toBe(false);
  });

  it("refuses more legs than the program will store", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ mint: mint(i + 1), bps: i === 0 ? 2000 : 1000 }));
    expect(many.reduce((n, l) => n + l.bps, 0)).toBe(10_000);
    expect(validatePolicy({ legs: many, driftBps: 0 }).ok).toBe(false);
  });

  it("accepts exactly the maximum", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ mint: mint(i + 1), bps: i === 0 ? 3000 : 1000 }));
    expect(validatePolicy({ legs: eight, driftBps: 0 }).ok).toBe(true);
  });

  it("refuses a zero-weight leg rather than ignoring it", () => {
    const o = validatePolicy({ legs: legs([mint(1), 10_000], [mint(2), 0]), driftBps: 0 });
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/weight of zero/);
  });

  it("refuses a duplicated mint even when the weights add up", () => {
    const o = validatePolicy({ legs: legs([mint(1), 5000], [mint(1), 5000]), driftBps: 0 });
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/appears twice/);
  });

  it("refuses the default address as a mint", () => {
    const o = validatePolicy({ legs: legs([PublicKey.default.toBase58(), 10_000]), driftBps: 0 });
    expect(o.ok).toBe(false);
  });

  it("refuses a string that is not a pubkey at all", () => {
    const o = validatePolicy({ legs: legs(["definitely-not-a-mint", 10_000]), driftBps: 0 });
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/not a valid mint address/);
  });

  it("refuses a drift band wider than the program allows", () => {
    expect(validatePolicy({ legs: legs([mint(1), 10_000]), driftBps: MAX_DRIFT_BPS }).ok).toBe(true);
    expect(validatePolicy({ legs: legs([mint(1), 10_000]), driftBps: MAX_DRIFT_BPS + 1 }).ok).toBe(false);
    expect(validatePolicy({ legs: legs([mint(1), 10_000]), driftBps: -1 }).ok).toBe(false);
  });

  it("names the asset in the message when it knows it", () => {
    const gold = assetBySymbol("GOLD")!;
    const o = validatePolicy({ legs: legs([gold.mint, 0], [mint(2), 10_000]), driftBps: 0 });
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toContain("GOLD");
  });
});

describe("storage round-trip", () => {
  it("survives serialize and parse", () => {
    const p = defaultPolicy();
    const back = parsePolicy(serializePolicy(p));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.legs).toEqual(p.legs);
    expect(back.value.driftBps).toBe(p.driftBps);
  });

  it("re-validates on the way OUT, not only on the way in", () => {
    // A row can be edited by something that is not this code — a migration, a console, a bug.
    // A policy is a money rule every time it is read, not only when it is written.
    const tampered = JSON.stringify({ legs: [{ mint: mint(1), bps: 9999 }], driftBps: 500 });
    expect(parsePolicy(tampered).ok).toBe(false);
  });

  it("holds on unreadable or malformed stored policies", () => {
    for (const bad of ["", "not json", "null", "{}", '{"legs":[{"mint":1}]}', '{"legs":"x"}']) {
      expect(parsePolicy(bad).ok, bad).toBe(false);
    }
  });
});

describe("targetOf", () => {
  it("splits a total by a leg's weight", () => {
    expect(targetOf(1_000_000_000n, 7000)).toBe(700_000_000n);
    expect(targetOf(1_000_000_000n, 3000)).toBe(300_000_000n);
  });

  it("truncates rather than rounding up, so the parts never exceed the whole", () => {
    // Three equal legs of a single base unit must not together claim more than existed.
    const parts = [3334, 3333, 3333].map((bps) => targetOf(1n, bps));
    expect(parts.reduce((a, b) => a + b, 0n)).toBeLessThanOrEqual(1n);
  });
});
