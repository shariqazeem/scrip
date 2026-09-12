import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE BUILD DIRECTORY IS WRITTEN IN FOUR PLACES, AND THEY DRIFT.
 *
 * `npm run build` writes beside the directory a dev server is serving from, because building
 * over it turns every route into a 500 until restart (measured here, 2026-09-12). That means
 * a second output directory exists, and it has to be named in the build script, .gitignore,
 * .prettierignore and the ESLint ignores.
 *
 * It was named in two of them. ESLint then walked 20 files of generated bundle output and
 * reported 562 errors in code nobody wrote — which is not a small annoyance: a lint run that
 * reports 5,828 problems is a lint run nobody reads, and the next real error hides in it.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("every build output directory is ignored everywhere", () => {
  const script = JSON.parse(read("package.json")).scripts.build as string;
  const match = /NEXT_DIST_DIR=([^\s]+)/.exec(script);
  const dirs = [".next", ...(match ? [match[1]!] : [])];

  it("names a distinct build directory so a build cannot clobber a running server", () => {
    expect(match, "npm run build no longer sets NEXT_DIST_DIR").toBeTruthy();
    expect(match![1]).not.toBe(".next");
  });

  for (const dir of dirs) {
    it(`${dir} is in .gitignore`, () => {
      expect(read(".gitignore")).toMatch(new RegExp(`^${escape(dir)}/?$`, "m"));
    });

    it(`${dir} is in the ESLint ignores`, () => {
      expect(read("eslint.config.mjs")).toContain(`"${dir}/**"`);
    });

    it(`${dir} is in .prettierignore`, () => {
      expect(read(".prettierignore")).toMatch(new RegExp(`^${escape(dir)}$`, "m"));
    });
  }
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
