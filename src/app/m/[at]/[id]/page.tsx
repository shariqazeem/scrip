import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScripMark } from "@/components/brand/scrip-mark";
import { StubFromArrival } from "@/components/stub/from-row";
import { dateUTC } from "@/lib/format";
import { loadMoment } from "./load";
import { cluster } from "@/lib/solana/cluster";
import "@/components/stub/stub.css";
import "../../../pay/pay.css";
import "@/styles/app.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ at: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { at, id } = await params;
  const found = await loadMoment(at, id);
  if (!found) return { title: "A moment on Scrip" };
  return { title: `@${found.slug}: ${found.milestone.line}`, description: `${found.milestone.sub} On ${dateUTC(found.milestone.atUnix)}, from a receipt anyone can open.` };
}

/**
 * A MOMENT, SHAREABLE. One line, the stub that crossed it, and the register it belongs to.
 * Understated by design: the milestone is a fact the chain already holds, not a prize.
 */
export default async function MomentPage({ params }: Params) {
  const { at, id } = await params;
  const found = await loadMoment(at, id);
  if (!found) notFound();
  const { slug, milestone, arrival } = found;
  return (
    <main className="sp-pay">
      <div className="sp-pay-col">
        <div className="sp-pay-top">
          <Link href="/" className="sp-pay-brand" aria-label="Scrip">
            <ScripMark size={20} />
            Scrip
          </Link>
          <span className="mono">{cluster() === "mainnet-beta" ? "Solana" : cluster()}</span>
        </div>
        <p className="sp-page-eyebrow">
          <Link href={`/@${slug}`}>@{slug}</Link> · {dateUTC(milestone.atUnix)}
        </p>
        <h1 className="sp-pay-h1">{milestone.line}</h1>
        <p className="sp-pay-lede">{milestone.sub}</p>
        {arrival ? (
          <div className="sp-moment-stub">
            <StubFromArrival a={arrival} handle={slug} compact={false} showHeld />
          </div>
        ) : null}
        <p className="sp-fact-note">
          <Link href={`/receipt/${milestone.sig}`}>Open the receipt</Link> that crossed it, or{" "}
          <Link href={`/@${slug}`}>watch @{slug}&rsquo;s register</Link>. Every figure here is read from the chain.
        </p>
      </div>
    </main>
  );
}
