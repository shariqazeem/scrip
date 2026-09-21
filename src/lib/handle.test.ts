import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_SLUG_LEN, MIN_SLUG_LEN, normalizeSlug, validateSlug } from "./handle";

const rust = readFileSync(join(__dirname, "..", "..", "anchor", "programs", "scrip", "src", "state.rs"), "utf8");

describe("validateSlug mirrors valid_slug", () => {
  it("uses the program's limits", () => {
    expect(rust).toMatch(new RegExp(`pub const MAX_SLUG_LEN: usize = ${MAX_SLUG_LEN};`));
    expect(rust).toMatch(new RegExp(`pub const MIN_SLUG_LEN: usize = ${MIN_SLUG_LEN};`));
  });
  it("accepts what the program accepts", () => {
    for (const s of ["shariq", "abc", "a1b2c3d4e5f6g7h8i9j0k1l2"]) expect(validateSlug(s).ok).toBe(true);
  });
  it("refuses what the program refuses", () => {
    for (const s of ["ab", "a1b2c3d4e5f6g7h8i9j0k1l2m", "Shariq", "sha-riq", "sha riq", "", "shariq!"]) {
      expect(validateSlug(s).ok, s).toBe(false);
    }
  });
});

describe("normalizeSlug", () => {
  it("makes a typed name into something the program would take", () => {
    expect(normalizeSlug("Shariq Rana")).toBe("shariqrana");
    expect(normalizeSlug("sha-riq_99")).toBe("shariq99");
    expect(normalizeSlug("x".repeat(40))).toHaveLength(MAX_SLUG_LEN);
  });
});
