import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JUMP_PAGES, resolveJump } from "./jump-resolve";

describe("⌘K resolves from shape", () => {
  it("a handle, with or without the at sign", () => {
    expect(resolveJump("@shariq")).toBe("/@shariq");
    expect(resolveJump("@Sha riq!")).toBe("/@shariq");
    expect(resolveJump("shariq")).toBe("/@shariq");
    expect(resolveJump("@")).toBeNull();
  });
  it("a run id, a receipt signature, a grant address", () => {
    expect(resolveJump("1e675ef9bbfcc650af2fbfb80c07a42d")).toBe("/run/1e675ef9bbfcc650af2fbfb80c07a42d");
    const sig = "3NbSbmZdHUnZPgxHKRKq1HpNYsgomZRxc7VEAtVGdLk5BpwkS48LxkwyNYm7J7NCRmocexP3g53F7J55ek58Fq4w";
    expect(resolveJump(sig)).toBe(`/receipt/${sig}`);
    expect(resolveJump("A2DmieF8JZLfiuffaE2xLgEk9PG7bLEUHMvqpdpFPFcZ")).toBe("/grant/A2DmieF8JZLfiuffaE2xLgEk9PG7bLEUHMvqpdpFPFcZ");
  });
  it("a page by name, and a path as itself", () => {
    expect(resolveJump("ledger")).toBe("/ledger");
    expect(resolveJump("Keepers")).toBe("/keepers");
    expect(resolveJump("/app/org/runs")).toBe("/app/org/runs");
  });
  it("nothing for a shape it does not know", () => {
    expect(resolveJump("")).toBeNull();
    expect(resolveJump("hello world")).toBeNull();
    expect(resolveJump("a-b")).toBeNull();
  });
});

describe("every page ⌘K offers exists", () => {
  // Two lists that drift: the jump list and the filesystem. This reads both.
  it.each(JUMP_PAGES.map(([href]) => href))("%s has a page.tsx", (href) => {
    expect(existsSync(join(process.cwd(), "src", "app", href.slice(1), "page.tsx")), `${href} is offered but has no page`).toBe(true);
  });
  it("has no duplicate destinations", () => {
    expect(new Set(JUMP_PAGES.map(([h]) => h)).size).toBe(JUMP_PAGES.length);
  });
});
