"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  HandCoins,
  House,
  Layers,
  ScrollText,
  Send,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import { WebgoldMark } from "@/components/brand/webgold-mark";
import { useSession } from "@/lib/session/use-session";
import { short } from "@/lib/format";

/**
 * The floating hover-expand rail. Collapsed it is a slim icon column; on hover it glides open
 * into a labelled card (brand → nav → identity). Active state comes from usePathname(). Below
 * 720px it reflows to a bottom icon bar, in CSS. Ported from Sage.
 *
 * TWO GROUPS, BECAUSE THE GROUPING IS THE NARRATIVE. Six items is the ceiling for a FLAT list;
 * past that a rail stops being navigation and becomes a sitemap. Labelled groups change the
 * arithmetic — nobody scans seven, they scan two headings and then four items under one.
 *
 * And the split says what the product is. YOUR BOOK is the position you own and the value you
 * move. PUBLIC is what anyone can open without an account: what a book may hold, everything
 * that has settled, and the docs. Webgold is a receive book with a public record; the rail
 * should read that way before a word of copy does.
 *
 * `/receipt/[sig]` is deliberately NOT here. It is one arrival, so it belongs where a payer
 * and a recipient are named — a book row, a ledger line — not in global chrome with no subject.
 */
const NAV = [
  {
    group: "Your book",
    items: [
      { href: "/app", label: "Book", Icon: House },
      { href: "/app/pay", label: "Pay", Icon: Send },
      { href: "/app/request", label: "Request", Icon: HandCoins },
      { href: "/app/goals", label: "Goals", Icon: Target },
      { href: "/app/settings", label: "Settings", Icon: Settings },
    ],
  },
  {
    group: "Public",
    items: [
      { href: "/assets", label: "Assets", Icon: Layers },
      { href: "/ledger", label: "Ledger", Icon: ScrollText },
      { href: "/docs", label: "Docs", Icon: BookOpen },
    ],
  },
] as const;

/** Every route the rail offers — the shell must survive all of them. Held by a test. */
export const RAIL_ROUTES: readonly string[] = NAV.flatMap((g) => g.items.map((i) => i.href));

/**
 * `/app` is an exact match; everything else matches its subtree. Without the exception
 * "Book" stays lit on `/app/pay` and two items read as active at once.
 */
function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppRail() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(false);
  const session = useSession();

  return (
    <div
      className={`app-rail${expanded ? " is-expanded" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <nav className="app-rail-card" aria-label="Webgold">
        {/* The mark goes to the public landing, not to the book — "Book" already has its own
            rail item, and a brand mark that lands you where you already are is a dead click. */}
        <Link href="/" className="app-rail-brand" aria-label="Webgold home">
          <WebgoldMark size={20} />
          <span className="app-rail-label">webgold</span>
        </Link>
        {NAV.map(({ group, items }) => (
          <div key={group} className="app-rail-group">
            {/* Collapsed, the rail is an icon column and a heading would be a stray word, so
                the label rides the same reveal as every other label. */}
            <span className="app-rail-grouplabel app-rail-label">{group}</span>
            {items.map(({ href, label, Icon }) => {
              const on = isActive(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`app-rail-item${on ? " on" : ""}`}
                  title={label}
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                >
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
            <span className="app-rail-sub">Your book</span>
          </span>
        </div>
      ) : (
        // The rail is chrome, not the place to render a list of wallets. It sends a
        // signed-out visitor to the book, which offers both doors.
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
