import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_PAGES } from "./pages";
import { SHELL_EXEMPT, isAppRoute } from "@/components/shell/routes";

/**
 * TWO LISTS THAT DRIFT, AGAIN: the docs nav and the pages that exist.
 *
 * A nav entry with no page is a 404 on the surface a stranger reads to decide whether to
 * trust the product; a page with no nav entry is a page nobody finds. This reads the
 * filesystem rather than a constant, so neither can happen quietly.
 */
const root = join(__dirname, "..", "..", "app", "docs");

function routes(dir: string, prefix = "/docs"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routes(full, `${prefix}/${entry}`));
    else if (entry === "page.tsx") out.push(prefix);
  }
  return out;
}

describe("the docs nav and the docs pages agree", () => {
  const onDisk = routes(root).sort();
  const inNav = DOC_PAGES.map((p) => p.href).sort();

  it("lists every page that exists, and no page that does not", () => {
    expect(inNav).toEqual(onDisk);
  });

  it("keeps every docs page unshelled", () => {
    // A stranger reading about custody should not be offered a rail link to "your book",
    // which promises an account they do not have.
    for (const href of onDisk) {
      expect(isAppRoute(href), `${href} is shelled`).toBe(false);
    }
    expect(SHELL_EXEMPT).toContain("/docs");
  });

  it("has more than just an index", () => {
    // The docs are where the technical depth becomes legible. One page is a landing section.
    expect(onDisk.length).toBeGreaterThan(1);
  });
});
