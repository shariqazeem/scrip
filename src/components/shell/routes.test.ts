import { describe, expect, it } from "vitest";
import { RAIL_ROUTES } from "./app-rail";
import { SHELL_EXEMPT, isAppRoute } from "./routes";

/**
 * TWO LISTS THAT DRIFT IS THE DOMINANT DEFECT SHAPE. The rail's nav and the shell's route
 * matcher live in different modules, and a link added to one without the other produces the
 * worst nav bug there is: you arrive somewhere and the chrome that brought you vanishes, so
 * there is no way back but the logo.
 *
 * This test reads BOTH lists. It is the reason the rule can stay a rule.
 */
describe("the rail and the shell agree", () => {
  it("every rail route is either shelled or a declared exemption", () => {
    for (const href of RAIL_ROUTES) {
      const exempt = SHELL_EXEMPT.some((e) => href === e || href.startsWith(`${e}/`));
      expect(
        isAppRoute(href) || exempt,
        `${href} is in the rail but is neither shelled nor listed in SHELL_EXEMPT`,
      ).toBe(true);
    }
  });

  it("every declared exemption is actually unshelled", () => {
    // An exemption that the matcher shells anyway is a lie in a comment — the exemption list
    // would read as documentation while the page rendered owner chrome regardless.
    for (const href of SHELL_EXEMPT) {
      expect(isAppRoute(href), `${href} is listed as exempt but isAppRoute matches it`).toBe(
        false,
      );
    }
  });

  it("the rail has no duplicate destinations", () => {
    expect(new Set(RAIL_ROUTES).size).toBe(RAIL_ROUTES.length);
  });
});

describe("isAppRoute", () => {
  it("shells the book and everything under it", () => {
    for (const p of ["/app", "/app/pay", "/app/goals", "/app/settings", "/assets", "/ledger"]) {
      expect(isAppRoute(p)).toBe(true);
    }
  });

  it("leaves the landing, receipts and docs unshelled", () => {
    // A receipt is opened by someone who has never heard of Webgold. Owner chrome offering
    // "Pay" turns an artifact into an advert.
    for (const p of ["/", "/receipt/5Xk2", "/docs", "/docs/custody"]) {
      expect(isAppRoute(p)).toBe(false);
    }
  });

  it("does not shell a route that merely starts with a shelled word", () => {
    // `/application` is not `/app`. A prefix match without a boundary is how an unrelated
    // route inherits chrome it was never meant to have.
    expect(isAppRoute("/applications")).toBe(false);
    expect(isAppRoute("/assetsomething")).toBe(false);
  });
});
