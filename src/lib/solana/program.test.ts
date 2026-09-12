import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEBGOLD_PROGRAM_ID } from "./program";

/**
 * TWO LISTS THAT DRIFT IS THE DOMINANT DEFECT SHAPE — and the program id is written in three
 * of them, by three different tools:
 *
 *   · `declare_id!(...)` in anchor/programs/webgold/src/lib.rs   (what the program enforces)
 *   · `[programs.localnet] / [programs.devnet]` in Anchor.toml   (where anchor deploys it)
 *   · `"address"` in the committed IDL                           (what the web app signs against)
 *
 * A disagreement between any two means the app builds transactions against a program that is
 * not the one deployed — which fails at best, and at worst succeeds against something else.
 * This test reads the actual files rather than a constant, so it cannot be satisfied by
 * updating a copy.
 */
const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the program id agrees everywhere it is written", () => {
  const id = WEBGOLD_PROGRAM_ID.toBase58();

  it("matches declare_id! in the program source", () => {
    const src = read("anchor/programs/webgold/src/lib.rs");
    const m = /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/.exec(src);
    expect(m, "no declare_id! found in the program source").toBeTruthy();
    expect(m![1]).toBe(id);
  });

  it("matches every [programs.*] entry in Anchor.toml", () => {
    const toml = read("anchor/Anchor.toml");
    const entries = [...toml.matchAll(/^\s*webgold\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"\s*$/gm)];
    // A cluster section that exists but names a different program is the exact failure this
    // catches — deploying to devnet under one id and signing against another.
    expect(entries.length, "no webgold entry found in Anchor.toml").toBeGreaterThan(0);
    for (const e of entries) expect(e[1]).toBe(id);
  });
});

describe("the committed IDL is not stale", () => {
  it("matches the freshly built IDL when one is present", () => {
    // anchor/target is gitignored, so this only asserts on a machine that has built the
    // program. On such a machine, a program change that was never synced into src/ is caught
    // here rather than at runtime, where it reads as an unexplained deserialization failure.
    let built: string;
    try {
      built = read("anchor/target/idl/webgold.json");
    } catch {
      return; // nothing built here; the agreement test above still holds
    }
    const committed = read("src/lib/anchor/webgold.json");
    expect(
      JSON.parse(committed),
      "src/lib/anchor/webgold.json is stale — run `npm run anchor:build`",
    ).toEqual(JSON.parse(built));
  });
});
