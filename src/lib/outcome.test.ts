import { describe, expect, it } from "vitest";
import { attempt, held, ok } from "./outcome";

describe("attempt is the last guard", () => {
  it("passes an outcome through untouched", async () => {
    expect(await attempt("the register", async () => ok(3))).toEqual({ ok: true, value: 3 });
    expect(await attempt("the register", async () => held("A price 40 minutes stale."))).toEqual({ ok: false, why: "A price 40 minutes stale." });
  });
  it("turns a throw into a hold that names what could not be read", async () => {
    const r = await attempt("this grant", async () => {
      throw new Error("socket hang up");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("Could not read this grant (socket hang up).");
  });
  it("says plainly when the endpoint is refusing, and that nothing is lost", async () => {
    const r = await attempt("this register", async () => {
      throw new Error('429 Too Many Requests: {"code": 429}');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.why).toContain("refusing reads right now");
      expect(r.why).toContain("It is not lost");
    }
  });
});
