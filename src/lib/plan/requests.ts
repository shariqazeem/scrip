/**
 * ASKING TO JOIN A PLAN — the rules, pure so a test holds them.
 *
 * A Plan funded by Scrip's own team takes requests from savers only while its escrow could pay
 * at least two people's whole monthly cap: an offer the escrow cannot keep is not an offer. The
 * sponsor reads the queue and invites by hand; a request is never a membership.
 */
export const REQUEST_ROOM_MONTHS = 2;

/** Each `add_member` is five accounts and an account's rent; ten fit comfortably in one transaction. */
export const INVITES_PER_TX = 10;

/** Whether a Plan's escrow, at Jupiter's price, leaves room to take requests. Unknown is no. */
export function takesRequests(escrowUsd: number | null, monthlyCapUsdc: bigint): boolean {
  if (escrowUsd === null || !Number.isFinite(escrowUsd) || monthlyCapUsdc <= 0n) return false;
  return escrowUsd >= (Number(monthlyCapUsdc) / 1e6) * REQUEST_ROOM_MONTHS;
}

export type PlanRequest = { readonly address: string; readonly createdAt: number };

/** The requests still waiting: nobody already invited or in the Plan, and never the sponsor. Oldest first. */
export function stillWaiting(requests: readonly PlanRequest[], members: readonly string[], sponsor: string): PlanRequest[] {
  const inPlan = new Set(members);
  return requests.filter((r) => r.address !== sponsor && !inPlan.has(r.address)).sort((a, b) => a.createdAt - b.createdAt);
}
