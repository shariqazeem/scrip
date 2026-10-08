import { describe, expect, it } from "vitest";
import { matchRefusedForGood } from "./refusal";

describe("a match the program will never pay", () => {
  it("is known by name or by its code in a failed simulation", () => {
    expect(matchRefusedForGood("AnchorError occurred. Error Code: AlreadyMatched. Error Number: 6065.")).toBe(true);
    expect(matchRefusedForGood("Transaction simulation failed: Error processing Instruction 2: custom program error: 0x17b1")).toBe(true);
    expect(matchRefusedForGood("custom program error: 0x17B3")).toBe(true);
    expect(matchRefusedForGood("Error Code: NothingToMatch")).toBe(true);
  });

  it("leaves anything that may pass to be tried again", () => {
    expect(matchRefusedForGood("custom program error: 0x1788")).toBe(false); // PriceStale
    expect(matchRefusedForGood("The transaction was not confirmed before its blockhash expired")).toBe(false);
    expect(matchRefusedForGood("failed to get accounts owned by program: account index service overloaded")).toBe(false);
  });
});
