import Link from "next/link";
import { assetByMint } from "@/lib/assets/registry";
import { short, usdc } from "@/lib/format";
import type { MemberView, PlanView } from "@/lib/plan/read";
import { nameOf } from "@/lib/save/names";
import { JoinPlan } from "./plan-actions";
import "./plan.css";

const MONTH = 30 * 86_400;

/**
 * THE PLANS THIS WALLET IS IN, on your savings. An invitation says exactly what the sponsor
 * adds and asks for one signature; a membership shows what has been matched, read from the
 * Member account the program keeps. Saves made before joining are never matched, and the copy
 * says so before the signature.
 */
export function PlanMemberships({ owner, cluster, rows, hasRecord }: { owner: string; cluster: string; rows: ReadonlyArray<{ member: MemberView; plan: PlanView }>; hasRecord: boolean }) {
  if (rows.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  return (
    <>
      {rows.map(({ member, plan }) => {
        const who = plan.sponsorHandle ? `@${plan.sponsorHandle}` : short(plan.sponsor);
        const stock = nameOf(assetByMint(plan.asset)?.symbol ?? plan.symbol);
        const terms = `${plan.matchBps / 100}% of every automatic save you make, in ${stock}, up to ${usdc(plan.monthlyCapUsdc)} a month`;
        if (member.status === "invited") {
          return (
            <section key={member.pda} className="sp-planm is-invite" aria-label="An invitation to a Plan">
              <p className="sp-planm-k">
                {who} invited you to a Plan{plan.name ? `: ${plan.name}` : ""}
              </p>
              <p className="sp-planm-p">
                They add {terms}, from an escrow only the program can pay out of. Every match paid to you is yours for good. Saves made before you join
                are not matched.
                {hasRecord ? null : (
                  <>
                    {" "}
                    Matches follow automatic saves, so <Link href="/app/rule">save every payment</Link> too.
                  </>
                )}
              </p>
              <JoinPlan owner={owner} cluster={cluster} plan={plan.pda} />
            </section>
          );
        }
        const thisMonth = now - member.periodStart < MONTH ? member.matchedThisPeriodUsdc : 0n;
        return (
          <section key={member.pda} className="sp-planm" aria-label="A Plan you are in">
            <p className="sp-planm-k">
              Matched by {who}
              {plan.name ? `, ${plan.name}` : ""}
            </p>
            <p className="sp-planm-big">{usdc(member.totalMatchedUsdc)}</p>
            <p className="sp-planm-p">
              {usdc(thisMonth)} of {usdc(plan.monthlyCapUsdc)} this month. They add {terms}.
              {hasRecord ? null : (
                <>
                  {" "}
                  Matches follow automatic saves: <Link href="/app/rule">save every payment</Link> to start.
                </>
              )}
            </p>
          </section>
        );
      })}
    </>
  );
}
