import { describe, expect, it } from "vitest";
import { currencyFor } from "./zones";

describe("the viewer's own currency", () => {
  it("comes from the clock first, because a phone's language is often en-US anywhere", () => {
    expect(currencyFor("Asia/Karachi", ["en-US"])).toBe("PKR");
    expect(currencyFor("Africa/Lagos", ["en-GB"])).toBe("NGN");
    expect(currencyFor("Europe/Berlin", ["en-US"])).toBe("EUR");
  });
  it("falls back to the language's region when the zone is not on the table", () => {
    expect(currencyFor("Antarctica/Troll", ["en-GB", "ur-PK"])).toBe("GBP");
    expect(currencyFor(undefined, ["hi-IN"])).toBe("INR");
  });
  it("says nothing it cannot tell, and a dollar viewer sees dollars", () => {
    expect(currencyFor("Antarctica/Troll", ["en"])).toBeNull();
    expect(currencyFor("America/New_York", ["en-US"])).toBe("USD");
  });
});
