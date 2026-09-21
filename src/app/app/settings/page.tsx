import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { SettingsForm } from "@/components/app/settings-form";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PublishToggle } from "@/components/org/publish-toggle";
import { TelegramLink } from "@/components/app/telegram-link";
import { liveView } from "@/lib/book/live";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";
import "@/components/org/org.css";
import "@/components/app/rule.css";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** SETTINGS — allowance, float, the public page, notifications, the handle. */
export default async function SettingsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Settings" title="Your register's settings." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await liveView(owner, { refresh: false });
  const view = v.ok ? v.value : null;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.trim() || null;
  return (
    <PageFrame eyebrow={view?.handle ? `@${view.handle}` : "Settings"} title="Settings." sub="What the rule may do, what pays for it, who can see it, and where a stub is announced." actions={<SignOut />}>
      <div className="sp-org">
        {!view?.handle ? (
          <p className="sp-register-empty">
            This wallet has no register yet. <Link href="/app/rule">Turn on the rule</Link> to open one.
          </p>
        ) : (
          <>
            <section className="sp-org-section">
              <p className="sp-section-label">
                <span>The rule&rsquo;s means</span>
                <Link href="/app/rule">change the rate</Link>
              </p>
              <SettingsForm owner={owner} delegatedAmount={view.usdc.delegatedAmount} floatLamports={view.floatLamports} sweepsCovered={view.sweepsCovered} ruleOn={view.ruleOn} />
            </section>
            <section className="sp-org-section">
              <p className="sp-section-label">
                <span>The public page</span>
              </p>
              <PublishToggle published={view.published} url={`${siteUrl()}/@${view.handle}`} kind="person" />
            </section>
            <section className="sp-org-section">
              <p className="sp-section-label">
                <span>When a stub prints</span>
              </p>
              <TelegramLink owner={owner} bot={bot} />
            </section>
            <section className="sp-org-section">
              <p className="sp-section-label">
                <span>The handle</span>
              </p>
              <p className="sp-fact">
                <span className="k">Handle</span>
                <span className="v">@{view.handle}</span>
              </p>
              <p className="sp-fact">
                <span className="k">Wallet</span>
                <span className="v">{owner}</span>
              </p>
              <p className="sp-fact">
                <span className="k">Pay link</span>
                <span className="v">{siteUrl()}/pay/{view.handle}</span>
              </p>
              <p className="sp-fact-note">A handle is one account on chain and cannot be renamed. One per wallet.</p>
            </section>
          </>
        )}
      </div>
    </PageFrame>
  );
}
