/**
 * ASK THE CHAIN BEFORE ASKING THE WALLET.
 *
 * A payment in stock that would fail used to reach Phantom anyway: its own simulation saw the
 * failure, warned in red, asked twice — and, confirmed, the transaction landed failed and the
 * payer still paid its fee. On 24 September a payer with 0.00075 SOL left tried to pay $4 in
 * stock: the escrow's token account needed 0.0015. Now the server simulates the payment first
 * and answers in a sentence, and the wallet is only ever asked to sign something that works.
 */
export type Refusal = { readonly kind: "sol" | "usdc" | "price" | "other"; readonly detail: string };

/** Why a simulated payment failed, read from its error and logs. Null when it did not. */
export function readSimulation(err: unknown, logs: readonly string[] | null | undefined): Refusal | null {
  if (!err) return null;
  const all = (logs ?? []).join("\n");
  if (/insufficient lamports|insufficient funds for rent|InsufficientFundsForRent|Attempt to debit an account but found no record of a prior credit/i.test(all + JSON.stringify(err))) {
    return { kind: "sol", detail: all.match(/insufficient lamports \d+, need \d+/i)?.[0] ?? "insufficient SOL" };
  }
  if (/Error: insufficient funds|custom program error: 0x1\b[\s\S]*Tokenkeg|TokenzQd[\s\S]*custom program error: 0x1\b/i.test(all)) {
    return { kind: "usdc", detail: "insufficient USDC" };
  }
  if (/SlippageToleranceExceeded|custom program error: 0x1771|ReceivedBelowMinimum|below the minimum/i.test(all)) {
    return { kind: "price", detail: "the route moved past the minimum" };
  }
  const last = [...(logs ?? [])].reverse().find((l) => /failed:|Error/i.test(l));
  return { kind: "other", detail: last?.replace(/^Program \w+ /, "").slice(0, 160) ?? JSON.stringify(err).slice(0, 160) };
}

/** Rent for the accounts a payment opens, by what it is: a pay settles at once, a gift waits for a claim. */
export function solNeeded(input: {
  readonly mode: "pay" | "gift";
  readonly payoutRent: bigint;
  readonly escrowRent: bigint;
  readonly receiptRent: bigint;
  readonly recipientAccountRent: bigint;
  readonly feeLamports: bigint;
}): bigint {
  const held = input.payoutRent + input.escrowRent + input.feeLamports;
  return input.mode === "pay" ? held + input.receiptRent + input.recipientAccountRent : held;
}

/**
 * Simulate a transaction the way the wallet would, before the wallet sees it. Null when it
 * would succeed — or when the RPC could not run the simulation, which must never block a
 * payment on its own: the wallet still checks.
 */
export async function simulateFirst(
  conn: { simulateTransaction: (tx: never, opts: never) => Promise<{ value: { err: unknown; logs: string[] | null } }> },
  tx: unknown,
): Promise<Refusal | null> {
  try {
    const sim = await conn.simulateTransaction(tx as never, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" } as never);
    return readSimulation(sim.value.err, sim.value.logs);
  } catch {
    return null;
  }
}
