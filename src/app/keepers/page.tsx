import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { since, short, usdc } from "@/lib/format";
import { keeperHealths } from "@/lib/keeper/health";
import { keepersFromReceipts } from "@/lib/ledger/indexer";
import { cluster } from "@/lib/solana/cluster";
import "@/components/app/live.css";

export const metadata: Metadata = { title: "Keepers", description: "The permissionless keepers that sweep Scrip's rules: who has submitted, what a keeper can and cannot do, and how to run one." };
export const dynamic = "force-dynamic";

/**
 * THE KEEPER NETWORK, AS THE CHAIN SEES IT. Every keeper that has ever submitted a sweep is
 * on a receipt as its submitter; that is the roster. The one Scrip runs reports its own
 * health beside it. Anyone can run one: the program leaves a keeper no discretion but the
 * route, and the tip pays it.
 */
export default async function KeepersPage() {
  const [roster, healths] = await Promise.all([keepersFromReceipts(), keeperHealths()]);
  const now = Math.floor(Date.now() / 1000);
  const health = healths[0] ?? { ok: false as const, why: "No keeper is configured on this deployment." };
  const watched = health.ok ? Object.values(health.value.books) : [];
  const waiting = watched.filter((b) => b.lastReason !== null);
  // Every keeper this deployment runs, reporting for itself. Two is the point.
  const reporting = healths.filter((h) => h.ok);

  return (
    <PageFrame eyebrow="Keepers" title="Permissionless keepers. No discretion but the route." sub="A keeper watches registers with the rule on and submits the sweep. The program computes the slice, checks the fill against Pyth, and writes the receipt; the keeper cannot change any of it. Anyone can run one.">
      <div className="sp-live">
        <section className="sp-section">
          <p className="sp-section-label">
            <span>{healths.length > 1 ? `Scrip runs ${healths.length} keepers, racing` : "Scrip\u2019s own keeper, right now"}</span>
            <span>{cluster()}</span>
          </p>
          {healths.length > 1 ? (
            <div>
              {healths.map((h, i) => (
                <p key={i} className="sp-fact">
                  <span className="k">Keeper {i + 1}</span>
                  <span className="v">
                    {h.ok ? `${short(h.value.keeper)} — reporting ${since(h.value.at, now * 1000)}, ${h.value.sweeps} sweep${h.value.sweeps === 1 ? "" : "s"}` : h.why}
                  </span>
                </p>
              ))}
              <p className="sp-fact-note">
                Different keys, the same open-source process. Whichever lands a sweep first writes the receipt; the other&rsquo;s transaction fails, because the
                program refuses to sweep the same arrival twice. {reporting.length} of {healths.length} reporting now.
              </p>
            </div>
          ) : null}
          {health.ok ? (
            <div className="sp-ledger-facts">
              <Fact k="Reporting" v={`${since(health.value.at, now * 1000)}`} note={`keeper ${short(health.value.keeper)}`} />
              <Fact k="Registers watched" v={String(watched.length)} note={waiting.length > 0 ? `${waiting.length} waiting on something` : "all clear"} />
              <Fact k="Sweeps since start" v={String(health.value.sweeps)} note={`up since ${since(health.value.startedAt, now * 1000)}`} />
              <Fact k="Pyth updates" v={health.value.hermes === "keyed" ? "posts its own" : "on-chain only"} note={health.value.hermes === "keyed" ? "fully verified, from Hermes" : "needs PYTH_API_KEY to post"} />
            </div>
          ) : (
            <p className="sp-register-empty">{health.why} Money that lands waits; nothing is lost. Any keeper can sweep it.</p>
          )}
          {waiting.length > 0 ? (
            <div>
              {waiting.slice(0, 8).map((b) => (
                <p key={b.owner} className="sp-fact">
                  <span className="k">{short(b.owner)}</span>
                  <span className="v">{b.lastReason}</span>
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="sp-section">
          <p className="sp-section-label">
            <span>Every keeper that has submitted a sweep</span>
            <span>from the receipts&rsquo; own submitter field</span>
          </p>
          {roster.length === 0 ? (
            <p className="sp-register-empty">No sweep has settled on this cluster yet. The first keeper to submit one appears here, named by the receipt it wrote.</p>
          ) : (
            <div>
              {roster.map((k) => (
                <p key={k.keeper} className="sp-fact">
                  <span className="k">
                    <span className="mono">{short(k.keeper)}</span>
                    {health.ok && health.value.keeper === k.keeper ? " (Scrip)" : ""}
                  </span>
                  <span className="v">
                    {k.sweeps} sweep{k.sweeps === 1 ? "" : "s"} across {k.books} book{k.books === 1 ? "" : "s"}, {usdc(k.paidUsdc)} converted, last {since(k.lastAt, now * 1000)}
                  </span>
                </p>
              ))}
            </div>
          )}
        </section>

        <div className="sp-live-grid">
          <section className="sp-section">
            <p className="sp-section-label">
              <span>What a keeper can and cannot do</span>
              <Link href="/docs/keepers">the sweep, instruction by instruction</Link>
            </p>
            <div>
              <Line k="Cannot choose the amount" v="the program computes the slice from on-chain state" />
              <Line k="Cannot skip the check" v="begin_sweep refuses unless finish_sweep follows in the same transaction" />
              <Line k="Must deliver the minimum" v="into the owner’s own token account: Pyth’s price net of confidence, less the owner’s tolerance" />
              <Line k="May keep the rest" v="the program checks the minimum, not the whole slice: about the tolerance plus Pyth’s band. Scrip’s keepers deliver all of it; the next upgrade requires it" />
              <Line k="Is paid the tip" v="0.0005 SOL plus the receipt’s rent, from the owner’s float" />
            </div>
          </section>
          <section className="sp-section">
            <p className="sp-section-label">
              <span>Run one</span>
            </p>
            <pre className="sp-code">{`git clone <this repository>
npm install
SCRIP_KEEPER_KEYPAIR=~/.config/solana/keeper.json \\
PYTH_API_KEY=… \\
NEXT_PUBLIC_SOLANA_CLUSTER=${cluster()} \\
npm run keeper`}</pre>
            <p className="sp-fact-note">A keeper needs a little SOL for fees and a USDC account to pass the slice through. It earns the tip on every sweep it lands first. Two keepers racing is the design.</p>
          </section>
        </div>
      </div>
    </PageFrame>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="sp-ledger-fact">
      <p className="k">{k}</p>
      <p className="v">{v}</p>
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}
function Line({ k, v }: { k: string; v: string }) {
  return (
    <p className="sp-fact">
      <span className="k">{k}</span>
      <span className="v is-words">{v}</span>
    </p>
  );
}
