import type { Metadata } from "next";
import { PublicKey } from "@solana/web3.js";
import { PageFrame } from "@/components/app/page-frame";
import { SignInPanel } from "@/components/app/savings-home";
import { SignOut } from "@/components/auth/connect";
import { ClosePlan, InviteRequests, InviteToPlan, RemoveFromPlan, TopUpPlan } from "@/components/plan/plan-actions";
import { type PlanAssetOpt, PlanForm } from "@/components/plan/plan-form";
import { assetByMint, defaultAsset, offeredAssets } from "@/lib/assets/registry";
import { dateUTC, short, unitsFromRaw, usd, usdc } from "@/lib/format";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { planEscrow } from "@/lib/plan/instructions";
import { type WaitingRequest, waitingRequests } from "@/lib/plan/open";
import { type MemberView, type PlanView, membersOf, plansOf } from "@/lib/plan/read";
import { waitedFor } from "@/lib/pyth/price";
import { priceStates } from "@/lib/pyth/ready";
import { nameOf } from "@/lib/save/names";
import { currentOwner } from "@/lib/session/server";
import { cluster, explorerUrl } from "@/lib/solana/cluster";
import { releaseIdFromHex } from "@/lib/solana/program";
import "@/components/org/org.css";
import "@/components/plan/plan.css";

export const metadata: Metadata = { title: "Match savers" };
export const dynamic = "force-dynamic";

const MONTH = 30 * 86_400;

/**
 * PLANS — a match the program enforces. A sponsor funds an escrow once; for every automatic
 * save a member makes, the program adds a share in stock, capped per person each month, in its
 * own transaction right after the save. The sponsor can end a Plan with nobody left in it and
 * take back what is unspent; a match already paid is never taken back.
 */
export default async function PlansPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Match what your people save.">
        <SignInPanel lead="Sign in with the wallet that will fund the match. It is a signature, not a transaction: nothing moves." />
      </PageFrame>
    );
  }
  const defaultMint = defaultAsset().mint;
  const assets = [...offeredAssets()].sort((a, b) => Number(b.mint === defaultMint) - Number(a.mint === defaultMint));
  const [plans, states] = await Promise.all([plansOf(owner), priceStates(assets)]);
  const list = plans.ok ? plans.value : [];
  const [members, quoted] = await Promise.all([
    Promise.all(list.map((p) => membersOf(p.pda))),
    list.length > 0 ? jupPrices([...new Set(list.map((p) => p.asset))]).catch(() => null) : Promise.resolve(null),
  ]);
  const priceOf = quoted && quoted.ok ? quoted.value : new Map<string, number>();
  // Who asked to join, from the savings page: still waiting, with whether each one saves.
  const asks = await Promise.all(list.map((p, i) => waitingRequests(p.pda, members[i]?.ok ? members[i].value.map((m) => m.owner) : [], p.sponsor).catch(() => [])));
  const opts: PlanAssetOpt[] = assets.map((a, i) => ({ mint: a.mint, name: nameOf(a.symbol), symbol: a.symbol, waits: states[i]!.ready === false ? (waitedFor(states[i]!.lastAt) ?? "days") : null }));
  const net = cluster();

  return (
    <PageFrame
      eyebrow="Pay in stock"
      title="Match what your people save."
      sub="A Plan adds a share of every automatic save your people make, in stock, from an escrow only the program can pay out of: capped per person each month, paid right after each save, never taken back."
      actions={<SignOut />}
    >
      <div className="sp-plan">
        {!plans.ok ? <p className="sp-register-empty">{plans.why}</p> : null}
        {list.map((p, i) => (
          <PlanCard key={p.pda} plan={p} members={members[i]?.ok ? members[i].value : []} asks={asks[i] ?? []} owner={owner} net={net} priceUsd={priceOf.get(p.asset) ?? null} />
        ))}
        <section className="sp-plan-new" aria-labelledby="new-plan">
          <h2 id="new-plan" className="sp-plan-h2">
            {list.length > 0 ? "Start another Plan" : "Start a Plan"}
          </h2>
          <PlanForm owner={owner} cluster={net} assets={opts} defaultMint={defaultMint} />
        </section>
      </div>
    </PageFrame>
  );
}

function PlanCard({ plan: p, members, asks, owner, net, priceUsd }: { plan: PlanView; members: MemberView[]; asks: WaitingRequest[]; owner: string; net: string; priceUsd: number | null }) {
  const name = nameOf(p.symbol);
  const id = releaseIdFromHex(p.planId);
  const asset = assetByMint(p.asset);
  const escrow = id.ok && asset ? planEscrow(new PublicKey(p.sponsor), id.value, asset) : null;
  const worth = p.escrowRaw !== null && priceUsd !== null ? (Number(p.escrowRaw) / 10 ** p.decimals) * priceUsd : null;
  const now = Math.floor(Date.now() / 1000);
  return (
    <article className="sp-plan-card">
      <header className="sp-plan-head">
        <div>
          <p className="sp-plan-name">{p.name ?? "A Plan"}</p>
          <p className="sp-plan-terms">
            Adds {p.matchBps / 100}% of every automatic save, in {name}, up to {usdc(p.monthlyCapUsdc)} a person each month.
          </p>
        </div>
        <a className="sp-plan-addr" href={explorerUrl("address", p.pda)}>
          {short(p.pda)}
        </a>
      </header>
      <dl className="sp-plan-figs">
        <div>
          <dt>In the escrow</dt>
          <dd>
            {p.escrowRaw !== null ? `${unitsFromRaw(p.escrowRaw, p.decimals)} ${name}` : "not read"}
            {worth !== null ? <span className="sub">about {usd(worth)} at Jupiter&rsquo;s price</span> : null}
          </dd>
        </div>
        <div>
          <dt>Matched so far</dt>
          <dd>
            {usdc(p.matchedUsdc)}
            <span className="sub">
              {p.matches} match{p.matches === 1 ? "" : "es"}
            </span>
          </dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{p.members}</dd>
        </div>
      </dl>
      <TopUpPlan owner={owner} cluster={net} plan={p.pda} stockName={name} />
      <InviteToPlan owner={owner} cluster={net} plan={p.pda} />
      {asks.length > 0 ? (
        <section className="sp-plan-asks" aria-label="Asked to join">
          <p className="sp-label">
            Asked to join, from their savings page ({asks.length})
          </p>
          <ul>
            {asks.map((a) => (
              <li key={a.address}>
                <a className="mono" href={explorerUrl("address", a.address)}>
                  {short(a.address)}
                </a>
                <span>
                  {a.ruleOn ? `saves every payment, ${a.saves} automatic save${a.saves === 1 ? "" : "s"}` : "not saving every payment"}, asked {dateUTC(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          <InviteRequests owner={owner} cluster={net} plan={p.pda} addresses={asks.map((a) => a.address)} />
        </section>
      ) : null}
      {members.length > 0 ? (
        <ul className="sp-plan-members" aria-label="People in this Plan">
          {members.map((m) => {
            const thisMonth = now - m.periodStart < MONTH ? m.matchedThisPeriodUsdc : 0n;
            return (
              <li key={m.pda}>
                <span className="who">
                  {m.ownerHandle ? `@${m.ownerHandle}` : <span className="mono">{short(m.owner)}</span>}
                  <span className="st">{m.status === "active" ? `joined ${dateUTC(m.joinedUnix)}` : "invited, not joined yet"}</span>
                </span>
                <span className="amt">
                  {usdc(m.totalMatchedUsdc)}
                  <span className="st">{usdc(thisMonth)} this month</span>
                </span>
                <RemoveFromPlan owner={owner} cluster={net} plan={p.pda} member={m.owner} />
              </li>
            );
          })}
        </ul>
      ) : null}
      <footer className="sp-plan-foot">
        <ClosePlan owner={owner} cluster={net} plan={p.pda} members={p.members} />
        {escrow ? (
          <p className="sp-hint">
            Or send {name} straight to the escrow,{" "}
            <a className="mono" href={explorerUrl("address", escrow.toBase58())}>
              {short(escrow.toBase58())}
            </a>
            , from any wallet.
          </p>
        ) : null}
      </footer>
    </article>
  );
}
