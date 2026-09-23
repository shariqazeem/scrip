import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { LiveBook } from "@/components/app/live-book";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { liveView } from "@/lib/book/live";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

/**
 * HOME — the moment. The rule in one line, the wallet being watched, the ghost of money that
 * landed, and the register of stubs that prints as arrivals settle. Rendered once on the
 * server, then polled every three seconds in the browser.
 */
export default async function HomePage() {
  const owner = await currentOwner();
  if (!owner) return <SignedOut />;
  const view = await liveView(owner, { refresh: false });
  if (!view.ok) {
    return (
      <PageFrame eyebrow="Home" title="Your register" actions={<SignOut />}>
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
