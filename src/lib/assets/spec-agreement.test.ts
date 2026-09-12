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
    const symbols = ["gold", "silver", "spy", "market"];
    const offenders: string[] = [];
    for (const file of tsxFiles(join(root, "src", "app"))) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        // A percentage literal sitting within a few words of a sleeve name.
        if (!/\d{1,3}%/.test(line)) continue;
        const lower = line.toLowerCase();
        if (symbols.some((s) => lower.includes(s))) {
          offenders.push(`${file.slice(root.length + 1)}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, `derive these from DEFAULT_POLICY_BPS instead:\n${offenders.join("\n")}`)
      .toHaveLength(0);
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
