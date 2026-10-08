import idl from "@/lib/anchor/scrip.json";

/**
 * WHEN A MATCH WILL NEVER BE PAID. The program refuses a match for good when the save was already
 * matched (or a later one was), the month's cap is spent, the escrow is empty, the Plan or the
 * membership is not active, or the receipt is not the member's save. Anything else — a price too
 * old, a refused read, a dropped transaction — passes, and the match is tried again.
 */
const FINAL = ["AlreadyMatched", "NothingToMatch", "PlanEmpty", "PlanNotActive", "MemberNotActive", "NotTheMember", "NotASweep"];

const FINAL_CODES = (idl as { errors?: Array<{ code: number; name: string }> }).errors
  ?.filter((e) => FINAL.includes(e.name))
  .map((e) => `custom program error: 0x${e.code.toString(16)}`) ?? [];

export function matchRefusedForGood(why: string): boolean {
  const lower = why.toLowerCase();
  return FINAL.some((name) => why.includes(name)) || FINAL_CODES.some((c) => lower.includes(c));
}
