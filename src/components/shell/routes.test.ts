import { describe, expect, it } from "vitest";
import { RAIL_ROUTES } from "./app-rail";
import { SHELL_EXEMPT, isAppRoute } from "./routes";

/**
 * TWO LISTS THAT DRIFT IS THE DOMINANT DEFECT SHAPE. The rail's nav and the shell's matcher
 * live in different modules. This test reads both.
 */
describe("the rail and the shell agree", () => {
  it("every rail route is either shelled or a declared exemption", () => {
    for (const href of RAIL_ROUTES) {
      const exempt = SHELL_EXEMPT.some((e) => href === e || href.startsWith(`${e}/`));
      expect(isAppRoute(href) || exempt, `${href} is in the rail but is neither shelled nor exempt`).toBe(true);
    }
  });
  it("every declared exemption is actually unshelled", () => {
    for (const href of SHELL_EXEMPT) expect(isAppRoute(href), `${href} is exempt but shelled`).toBe(false);
  });
  it("the rail has no duplicate destinations", () => {
    expect(new Set(RAIL_ROUTES).size).toBe(RAIL_ROUTES.length);
  });
});

describe("isAppRoute", () => {
  it("shells the book and everything under it", () => {
    for (const p of ["/app", "/app/rule", "/app/org", "/app/org/runs", "/assets", "/ledger", "/keepers", "/floor"]) expect(isAppRoute(p)).toBe(true);
  });
  it("leaves the landing, pay, receipts, claims and docs unshelled", () => {
    // A receipt is opened by someone who has never heard of Scrip; a pay page by a payer with
    // no account; a claim by an empty wallet. Owner chrome on any of them is an advert.
    for (const p of ["/", "/pay/shariq", "/@shariq", "/run/abc", "/grant/abc", "/receipt/5Xk2", "/claim/abc", "/docs", "/docs/keep-rate"]) expect(isAppRoute(p)).toBe(false);
  });
  it("does not shell a route that merely starts with a shelled word", () => {
    expect(isAppRoute("/applications")).toBe(false);
    expect(isAppRoute("/assetsomething")).toBe(false);
  });
});
