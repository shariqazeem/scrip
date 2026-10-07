import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { LiveBook } from "@/components/app/live-book";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { liveView } from "@/lib/book/live";
import { SavedList } from "@/components/save/saved-list";
import { savesFor } from "@/lib/save/index-saves";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

/**
 * HOME — your savings. Saving every payment in one line, the wallet being watched, the ghost
 * of money that landed, and the receipts that print as payments are saved; then the saves
 * this wallet made by hand. Rendered once on the server, then polled every three seconds.
 */
export default async function HomePage() {
  const owner = await currentOwner();
  if (!owner) return <SignedOut />;
  const [view, saved] = await Promise.all([liveView(owner, { refresh: false }), savesFor(owner, 20)]);
  if (!view.ok) {
    return (
      <PageFrame eyebrow="Home" title="Your savings" actions={<SignOut />}>
        <div className="sp-held">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          <span>{view.why}</span>
        </div>
      </PageFrame>
    );
  }
  return (
    <PageFrame eyebrow={view.value.handle ? `@${view.value.handle}` : "Home"} title="" actions={<SignOut />}>
      <LiveBook initial={view.value} mode="owner" site={siteUrl()} />
      <section className="sp-section sp-saved-section" aria-label="Saved now">
        <p className="sp-section-label">
          <span>Saved now</span>
          <Link href="/#save">save again</Link>
        </p>
        <SavedList rows={saved} />
      </section>
    </PageFrame>
  );
}

function SignedOut() {
  return (
    <PageFrame eyebrow="Home" title="Your income invests itself." sub="Sign in with the wallet you already get paid to. A signature, not a transaction.">
      <ConnectWallet />
    </PageFrame>
  );
}
