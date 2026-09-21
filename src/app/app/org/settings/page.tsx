import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PublishToggle } from "@/components/org/publish-toggle";
import { orgView } from "@/lib/org/view";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Organisation settings" };
export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Settings." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await orgView(owner);
  const o = v.ok ? v.value : null;
  return (
    <PageFrame eyebrow="Pay in stock" title="Settings and exports." actions={<SignOut />}>
      <div className="sp-org">
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>The handle</span>
          </p>
          {o?.handle ? (
            <div>
              <p className="sp-fact">
                <span className="k">Handle</span>
                <span className="v">@{o.handle}</span>
              </p>
              <p className="sp-fact">
                <span className="k">Kind</span>
                <span className="v">{o.kind === "org" ? "organisation" : "person"}</span>
              </p>
              <p className="sp-fact">
                <span className="k">Wallet</span>
                <span className="v">{owner}</span>
              </p>
              <p className="sp-fact-note">A handle is one account on chain and cannot be renamed. One per wallet.</p>
            </div>
          ) : (
            <p className="sp-register-empty">
              This wallet has no register yet. <Link href="/app/org">Open an organisation register</Link>, or <Link href="/app/rule">a person&rsquo;s with a rule</Link>.
            </p>
          )}
        </section>
        {o?.handle ? (
          <section className="sp-org-section">
            <p className="sp-section-label">
              <span>The public page</span>
            </p>
            <PublishToggle published={o.published} url={`${siteUrl()}/@${o.handle}`} kind={o.kind} />
          </section>
        ) : null}
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Exports</span>
            <span>for whoever does the books</span>
          </p>
          <div className="sp-actions">
            <a href="/api/org/export?what=payments" className="sp-action" download>
              Payments, CSV
            </a>
            <a href="/api/org/export?what=grants" className="sp-action" download>
              Grants, CSV
            </a>
          </div>
          <p className="sp-fact-note">Every row carries its signature and receipt account, so an auditor can open each one on chain.</p>
        </section>
      </div>
    </PageFrame>
  );
}
