"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, BookOpen, FileText, House, Layers, Radio, Receipt, ScrollText, Send, Settings, SlidersHorizontal, Wallet } from "lucide-react";
import { ScripMark } from "@/components/brand/scrip-mark";
import { useSession } from "@/lib/session/use-session";
import { short } from "@/lib/format";

/**
 * The floating hover-expand rail. Collapsed it is a slim icon column; on hover it glides
 * open into a labelled card. Below 720px it reflows to a bottom icon bar, in CSS.
 *
 * TWO GROUPS. YOUR BOOK is the rule, what arrives under it, and paying someone in stock.
 * PUBLIC is what anyone can open without an account: everything that has settled, the
 * keepers, and the docs. Assets is reached from the rule and the docs, not from chrome.
 *
 * `/pay`, `/receipt` and `/claim` are deliberately NOT here: each belongs to somebody who
 * is not the owner, so they are reached from a book, a link or a ledger row, never chrome.
 */
const NAV = [
  {
    group: "Your register",
    items: [
      { href: "/app", label: "Home", Icon: House },
      { href: "/app/rule", label: "Rule", Icon: SlidersHorizontal },
      { href: "/app/holdings", label: "Holdings", Icon: Layers },
      { href: "/app/receipts", label: "Receipts", Icon: Receipt },
      { href: "/app/statements", label: "Statements", Icon: FileText },
      { href: "/app/settings", label: "Settings", Icon: Settings },
      { href: "/app/org", label: "Pay in stock", Icon: Send },
    ],
  },
  {
    group: "Public",
    items: [
      { href: "/floor", label: "The floor", Icon: Activity },
      { href: "/ledger", label: "Ledger", Icon: ScrollText },
      { href: "/keepers", label: "Keepers", Icon: Radio },
      { href: "/docs", label: "Docs", Icon: BookOpen },
    ],
  },
] as const;

/** Every route the rail offers — the shell must survive all of them. Held by a test. */
export const RAIL_ROUTES: readonly string[] = NAV.flatMap((g) => g.items.map((i) => i.href));

function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppRail() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(false);
  const session = useSession();

  return (
    <div className={`app-rail${expanded ? " is-expanded" : ""}`} onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
      <nav className="app-rail-card" aria-label="Scrip">
        <Link href="/" className="app-rail-brand" aria-label="Scrip home">
          <ScripMark size={20} />
          <span className="app-rail-label">Scrip</span>
        </Link>
        {NAV.map(({ group, items }) => (
          <div key={group} className="app-rail-group">
            <span className="app-rail-grouplabel app-rail-label">{group}</span>
            {items.map(({ href, label, Icon }) => {
              const on = isActive(href, pathname);
              return (
                <Link key={href} href={href} className={`app-rail-item${on ? " on" : ""}`} title={label} aria-label={label} aria-current={on ? "page" : undefined}>
                  <Icon size={19} strokeWidth={1.9} />
                  <span className="app-rail-label">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {session.loading ? (
        <div className="app-rail-pill app-rail-user" aria-hidden>
          <span className="app-rail-avatar">
            <Wallet size={14} strokeWidth={2} />
          </span>
          <span className="app-rail-label">…</span>
        </div>
      ) : session.owner ? (
        <div className="app-rail-pill app-rail-user" title={session.owner}>
          <span className="app-rail-avatar">
            <Wallet size={14} strokeWidth={2} />
          </span>
          <span className="app-rail-label">
            <span className="mono">{short(session.owner)}</span>
            <span className="app-rail-sub">Your register</span>
          </span>
        </div>
      ) : (
        <Link className="app-rail-pill app-rail-user" href="/app" title="Sign in">
          <span className="app-rail-avatar">
            <Wallet size={14} strokeWidth={2} />
          </span>
          <span className="app-rail-label">Sign in</span>
        </Link>
      )}
    </div>
  );
}
