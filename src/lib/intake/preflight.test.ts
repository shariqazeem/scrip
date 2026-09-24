import { describe, expect, it } from "vitest";
import { readSimulation, solNeeded } from "./preflight";

// The payment that failed on mainnet on 24 September, as its logs read.
const FAILED = [
  "Program Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj invoke [1]",
  "Program log: Instruction: FundPayout",
  "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]",
  "Program 11111111111111111111111111111111 invoke [3]",
  "Transfer: insufficient lamports 750920, need 1488440",
  "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
];

describe("reading a simulated payment", () => {
  it("names a SOL shortfall, from the failed payment's own logs", () => {
    expect(readSimulation({ InstructionError: [3, { Custom: 1 }] }, FAILED)).toEqual({ kind: "sol", detail: "insufficient lamports 750920, need 1488440" });
  });
  it("names a payer with no SOL at all", () => {
    expect(readSimulation("AccountNotFound", ["Attempt to debit an account but found no record of a prior credit."])?.kind).toBe("sol");
  });
  it("names a USDC shortfall", () => {
    expect(readSimulation({ InstructionError: [4, { Custom: 1 }] }, ["Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]", "Program log: Error: insufficient funds"])?.kind).toBe("usdc");
  });
  it("names a route that moved past the minimum", () => {
    expect(readSimulation({ InstructionError: [5, { Custom: 6001 }] }, ["Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded."])?.kind).toBe("price");
  });
  it("is null when nothing failed", () => {
    expect(readSimulation(null, ["Program log: ok"])).toBeNull();
  });
});

describe("the SOL a payment needs while it settles", () => {
  const r = { payoutRent: 1_798_320n, escrowRent: 1_559_560n, receiptRent: 2_519_680n, recipientAccountRent: 1_559_560n, feeLamports: 100_000n };
  it("a pay holds the escrow and pays the receipt, and the recipient's new account", () => {
    expect(solNeeded({ mode: "pay", ...r })).toBe(7_537_120n);
  });
  it("a gift holds only the escrow until it is claimed", () => {
    expect(solNeeded({ mode: "gift", ...r })).toBe(3_457_880n);
  });
});
