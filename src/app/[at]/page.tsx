import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { LiveBook } from "@/components/app/live-book";
import { ScripMark } from "@/components/brand/scrip-mark";
import { OrgPublic } from "@/components/org/org-public";
import { liveView } from "@/lib/book/live";
import { readHandle } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { validateSlug } from "@/lib/handle";
import { orgView } from "@/lib/org/view";
import { cluster } from "@/lib/solana/cluster";
import { siteUrl } from "@/lib/site";
import "../pay/pay.css";
import "@/styles/app.css";
import "@/components/org/org.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ at: string }> };

/** `/@handle`: a person's register (when they published it) or an organisation's page. */
function slugOf(at: string): string | null {
  const raw = decodeURIComponent(at);
  if (!raw.startsWith("@")) return null;
  const v = validateSlug(raw.slice(1));
  return v.ok ? v.value : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { at } = await params;
  const slug = slugOf(at);
  if (!slug) return { title: "Scrip" };
  const h = await readHandle(slug);
  const kind = h.ok && h.value ? h.value.kind : null;
  return {
    title: `@${slug}`,
    description: kind === "org" ? `@${slug} pays in stock through Scrip: people paid, stock delivered, grants vesting, every receipt.` : `Watch USDC arrive at @${slug}'s register and become stock, with a receipt, in seconds.`,
  };
}

export default async function HandlePage({ params }: Params) {
  const { at } = await params;
  const slug = slugOf(at);
  if (!slug) notFound();
  const h = await readHandle(slug);
  const owner = h.ok && h.value ? h.value.owner : null;
  const kind = h.ok && h.value ? h.value.kind : null;
  const row = owner ? (await db.select({ published: books.published }).from(books).where(eq(books.owner, owner)).limit(1))[0] : undefined;

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
        {!owner ? (
          <>
            <h1 className="sp-pay-h1">Nobody has @{slug} yet.</h1>
            <p className="sp-pay-lede">
              If it is yours, <Link href="/app/rule">open a register</Link> and take it.
            </p>
          </>
        ) : kind === "org" ? (
          await (async () => {
            const v = await orgView(owner);
            return v.ok ? <OrgPublic view={v.value} site={siteUrl()} /> : <p className="sp-pay-lede">{v.why}</p>;
          })()
        ) : !row || row.published !== 1 ? (
          <>
            <h1 className="sp-pay-h1">@{slug} keeps their register private.</h1>
            <p className="sp-pay-lede">
              A register is private unless its owner publishes it. <Link href={`/pay/${slug}`}>You can still pay @{slug}.</Link>
            </p>
          </>
        ) : (
          await (async () => {
            const view = await liveView(owner, { refresh: false });
            if (!view.ok) return <p className="sp-pay-lede">{view.why}</p>;
            return (
              <>
                <p className="sp-page-eyebrow">@{slug}, live</p>
                <LiveBook initial={view.value} mode="public" site={siteUrl()} />
              </>
            );
          })()
        )}
      </div>
    </main>
  );
}
