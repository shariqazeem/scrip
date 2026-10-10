import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/landing.css";
import { HomeNav } from "./home-nav";
import "./site.css";

/**
 * THE MARKETING FRAME — the paper nav of the front door, then the page on paper. Every page
 * under it is a stranger's page: no session, no owner chrome, the same doors as the front.
 * Since the final plan only /proof is ink.
 */
export function SiteFrame({ eyebrow, title, lede, children, wide = false }: { eyebrow: string; title: string; lede: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="sp-landing sp-site">
      <HomeNav />
      <main className={`sp-sec sp-site-main${wide ? " is-wide" : ""}`}>
        <p className="sp-kicker">{eyebrow}</p>
        <h1 className="sp-site-h1">{title}</h1>
        <p className="sp-lede">{lede}</p>
        <div className="sp-site-body">{children}</div>
      </main>
      <footer className="sp-site-foot">
        <span>Scrip</span>
        <span className="sp-foot-spacer" />
        <Link href="/company">Company</Link>
        <Link href="/security">Security</Link>
        <Link href="/bounties">Bounties</Link>
        <Link href="/curve">Launchpad</Link>
        <Link href="/proof">Proof</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/changelog">Changelog</Link>
        <Link href="/brand">Brand</Link>
        <Link href="/docs">Docs</Link>
      </footer>
    </div>
  );
}

/** A ruled section on a site page: a label, then rows or paragraphs. */
export function SiteSection({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sp-site-section">
      <p className="sp-section-label">
        <span>{label}</span>
        {aside ? <span>{aside}</span> : null}
      </p>
      {children}
    </section>
  );
}

export function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="sp-truth">
      <span className="k">{k}</span>
      <p className="v">{children}</p>
    </div>
  );
}
