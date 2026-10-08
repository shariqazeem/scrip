/**
 * THE TEAM'S OWN WALLETS — declared, so every count of people can leave them out.
 *
 * A receipt to one of these is Scrip paying itself or its founder testing the product. A judge
 * reading the ledger should not have to work that out from addresses, and a number that
 * counts people should never quietly include the people who built it. Surfaces that show a
 * receipt mark these; surfaces that count people count the others. None of them hides one.
 */
export const TEAM: ReadonlyMap<string, string> = new Map([
  ["BbDN31Q4qK53ddNuJnvpvWfC5UFMi87HGxQmuJobUv3q", "@scrip — Scrip's own register"],
  ["EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5", "@shariq — the founder"],
  ["9zzN2FkbG2AwHZCH1cnH6Wxo4V7YzFoKKqJXRvLATohJ", "Scrip's saving service"],
  ["E73zEBRtVvRKQNGmU5ABEgsq4ufQ8WhsC6vktTEqoJ8s", "Scrip's saving service, second server"],
  ["CGRv3QJTLbcYKCN9R4hNqN1pt5vEBqWY9MLNxSKu13aA", "Scrip's service wallet"],
  // Claimed from the founder's gifts while the claim flow was being tested, 22–23 September.
  // Counted as the team's until shown otherwise: a count of outsiders should err low.
  ["5hqYeJRgY8oSoYGTBaxqggpJroEhKHvSNgbrYCjuqDaj", "a claim made while testing"],
  ["8VLpA2ABxTC1dSnfFHoguASWCwDbX2PD7nsm9nYJPazW", "a claim made while testing"],
  // The founder's demo wallet: the rule turned on and the first $5 swept on camera, 24 September.
  ["6mCBiCNNpaN8roM3HDJazNtceKEkTbWQzep71ae9fKDE", "the demo wallet"],
]);

/**
 * PAID TESTERS — people paid to try Scrip and say what broke. Not the team, and not strangers:
 * their stubs say "paid tester" and every count of people outside the team leaves them out, so a
 * paid test is never passed off as a user. Add each with the date and what they were paid.
 */
export const TESTERS: ReadonlyMap<string, string> = new Map<string, string>([
  // ["<address>", "paid tester, 9 Oct 2026, $10 USDC"],
]);

export function isTeam(address: string | null | undefined): boolean {
  return typeof address === "string" && TEAM.has(address);
}

export function isTester(address: string | null | undefined): boolean {
  return typeof address === "string" && TESTERS.has(address);
}

/** Neither the team nor a paid tester: someone Scrip actually reached. */
export function isStranger(address: string | null | undefined): boolean {
  return typeof address === "string" && !TEAM.has(address) && !TESTERS.has(address);
}

/** The word a stub wears beside the brand for a wallet that is not a stranger's, or nothing. */
export function walletTag(address: string | null | undefined): "team" | "paid tester" | undefined {
  return isTeam(address) ? "team" : isTester(address) ? "paid tester" : undefined;
}

/** Receipts to people outside the team, paid testers left out, and the paid testers' apart. */
export function outsideTeam(rows: ReadonlyArray<{ readonly recipient: string }>): {
  readonly receipts: number;
  readonly wallets: number;
  readonly testerReceipts: number;
  readonly testers: number;
} {
  const outside = rows.filter((r) => isStranger(r.recipient));
  const testers = rows.filter((r) => isTester(r.recipient));
  return {
    receipts: outside.length,
    wallets: new Set(outside.map((r) => r.recipient)).size,
    testerReceipts: testers.length,
    testers: new Set(testers.map((r) => r.recipient)).size,
  };
}
