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
  ["9zzN2FkbG2AwHZCH1cnH6Wxo4V7YzFoKKqJXRvLATohJ", "keeper one"],
  ["E73zEBRtVvRKQNGmU5ABEgsq4ufQ8WhsC6vktTEqoJ8s", "keeper two"],
  ["CGRv3QJTLbcYKCN9R4hNqN1pt5vEBqWY9MLNxSKu13aA", "the relayer and crank"],
  // Claimed from the founder's gifts while the claim flow was being tested, 22–23 September.
  // Counted as the team's until shown otherwise: a count of outsiders should err low.
  ["5hqYeJRgY8oSoYGTBaxqggpJroEhKHvSNgbrYCjuqDaj", "a claim made while testing"],
  ["8VLpA2ABxTC1dSnfFHoguASWCwDbX2PD7nsm9nYJPazW", "a claim made while testing"],
  // The founder's demo wallet: the rule turned on and the first $5 swept on camera, 24 September.
  ["6mCBiCNNpaN8roM3HDJazNtceKEkTbWQzep71ae9fKDE", "the demo wallet"],
]);

export function isTeam(address: string | null | undefined): boolean {
  return typeof address === "string" && TEAM.has(address);
}

/** Receipts whose recipient is not the team's: the people Scrip has actually reached. */
export function outsideTeam(rows: ReadonlyArray<{ readonly recipient: string }>): { readonly receipts: number; readonly wallets: number } {
  const outside = rows.filter((r) => !isTeam(r.recipient));
  return { receipts: outside.length, wallets: new Set(outside.map((r) => r.recipient)).size };
}
