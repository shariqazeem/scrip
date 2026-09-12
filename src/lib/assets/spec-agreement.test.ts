import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_BPS, assetBySymbol } from "./registry";

/**
 * THE SPEC AND THE CODE ARE TWO LISTS, AND THEY DRIFT.
 *
 * `CLAUDE.md` is the canonical product law and `registry.ts` is what actually runs. When the
 * default mix changed — silver failed the metal test on live data and the founder moved its
 * weight to gold — there were suddenly five places carrying a number: the spec, the product
 * doc, the registry, and the prose on two pages. Four of them are prose, which is exactly the
 * kind of thing nobody greps for.
 *
 * So this test reads the spec file itself and compares it to the constant. It cannot be
 * satisfied by updating a copy, and it fails loudly the next time one of them moves alone.
 */
const root = join(__dirname, "..", "..", "..");

describe("CLAUDE.md and the registry agree on the default mix", () => {
  it("states every weight the registry holds, and no others", () => {
    const spec = readFileSync(join(root, "CLAUDE.md"), "utf8");
    // The law line: "defaulting to **70% gold, 30% SPY**".
    const m = /defaulting to \*\*([^*]+)\*\*/.exec(spec);
    expect(m, "CLAUDE.md no longer states the default mix in the expected form").toBeTruthy();
    const stated = m![1]!;

    for (const leg of DEFAULT_POLICY_BPS) {
      const pct = `${leg.bps / 100}%`;
      expect(stated, `CLAUDE.md does not state ${pct} for ${leg.symbol}`).toContain(pct);
    }
    // And nothing the registry dropped is still being claimed.
    expect(stated.toLowerCase()).not.toContain("silver");
  });
});

/**
 * NO USER-FACING SURFACE MAY HARDCODE A POLICY WEIGHT.
 *
 * Prose is the worst place for a number that can change, because it is the copy a person
 * actually reads and the last thing anyone updates. Every weight on a page is derived from
 * `DEFAULT_POLICY_BPS`; this is the guard that keeps it that way.
 */
function* tsxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* tsxFiles(full);
    else if (entry.endsWith(".tsx")) yield full;
  }
}

describe("no page writes a policy weight into its copy", () => {
  it("has no hardcoded percentage beside a sleeve name", () => {
    /**
     * PROXIMITY AND WORD BOUNDARIES, not substring matching.
     *
     * The first version looked for a sleeve name anywhere on a line with a percentage on it,
     * and immediately fired on a docs sentence containing "a 300% return" and the word
     * "Webgold" — because "webgold" contains "gold". A guard that cries wolf gets deleted, and
     * then the thing it guarded drifts freely.
     *
     * So: the brand is removed first, the sleeve names are matched as whole words, and the
     * percentage has to sit close enough to be describing that sleeve rather than merely
     * sharing a sentence with it.
     */
    const SLEEVE = /\b(gold|silver|spy|spyx|market)\b/gi;
    const NEAR = 24;
    const offenders: string[] = [];
    for (const file of tsxFiles(join(root, "src", "app"))) {
      const text = readFileSync(file, "utf8");
      for (const raw of text.split("\n")) {
        const line = raw.replace(/webgold/gi, "");
        if (!/\d{1,3}%/.test(line)) continue;
        for (const m of line.matchAll(SLEEVE)) {
          const window = line.slice(
            Math.max(0, m.index - NEAR),
            m.index + m[0].length + NEAR,
          );
          if (/\d{1,3}%/.test(window)) {
            offenders.push(`${file.slice(root.length + 1)}: ${raw.trim()}`);
            break;
          }
        }
      }
    }
    expect(offenders, `derive these from DEFAULT_POLICY_BPS instead:\n${offenders.join("\n")}`)
      .toHaveLength(0);
  });

  it("still catches a weight written into copy", () => {
    // The guard has to keep working after being narrowed. This is the shape it exists for.
    const SLEEVE = /\b(gold|silver|spy|spyx|market)\b/gi;
    const bad = "The default is 50% gold, 20% silver, 30% SPY.";
    const hit = [...bad.matchAll(SLEEVE)].some((m) =>
      /\d{1,3}%/.test(bad.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24)),
    );
    expect(hit).toBe(true);
  });
});

describe("every registry symbol the default names is real", () => {
  it("resolves each weighted symbol to a registered asset with a metal or equity unit", () => {
    for (const leg of DEFAULT_POLICY_BPS) {
      const a = assetBySymbol(leg.symbol);
      expect(a, `${leg.symbol} is weighted but unregistered`).toBeDefined();
      expect(["gram", "troy-ounce", "share"]).toContain(a!.unit);
    }
  });
});
