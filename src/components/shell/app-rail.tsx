"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Ellipsis, FileText, HandCoins, House, Layers, PiggyBank, Receipt, Rocket, ScrollText, Send, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Wallet, X } from "lucide-react";
import { ScripMark } from "@/components/brand/scrip-mark";
import { useSession } from "@/lib/session/use-session";
import { short } from "@/lib/format";

/**
 * The floating hover-expand rail. Collapsed it is a slim icon column; on hover it glides
 * open into a labelled card. Below 720px it reflows to a bottom icon bar, in CSS.
 *
 * FOUR GROUPS, ONE PER THING A PERSON COMES TO DO (10 Oct, the founder: "every feature should be
 * automatically findable … they shouldn't be confused or lost anywhere"). YOUR SAVINGS is the
 * saver: the first screen, saving now, saving every payment, the receipts, the stocks, the
 * statements, the settings. FOR TEAMS is whoever pays people: pay in stock, and Plans that match
 * what their people save. LAUNCHPAD is Scrip Curve: launch a token priced in a stock, and every
 * launch. PUBLIC is what anyone can check: the proof, the ledger and the docs. The groups are
 * the front door's three ways stock reaches someone, in the same words as the public nav.
 *
 * ON A PHONE the rail is a bottom bar of FIVE labelled tabs: Home, Save, Every payment,
 * Receipts, and More, which opens the rest under the same group headings.
 *
 * `/pay`, `/receipt` and `/claim` are deliberately NOT here: each belongs to somebody who
 * is not the owner, so they are reached from a book, a link or a ledger row, never chrome.
 */
const NAV = [
  {
    group: "Your savings",
    items: [
      { href: "/app", label: "Home", phone: "Home", Icon: House },
      { href: "/app/save", label: "Save now", phone: "Save", Icon: PiggyBank },
      { href: "/app/rule", label: "Every payment", phone: "Every payment", Icon: SlidersHorizontal },
      { href: "/app/receipts", label: "Receipts", phone: "Receipts", Icon: Receipt },
      { href: "/app/holdings", label: "Stocks", phone: null, Icon: Layers },
      { href: "/app/statements", label: "Statements", phone: null, Icon: FileText },
      { href: "/app/settings", label: "Settings", phone: null, Icon: Settings },
    ],
  },
  {
    group: "For teams",
    items: [
      { href: "/app/org", label: "Pay in stock", phone: null, Icon: Send },
      { href: "/app/org/plans", label: "Match savers", phone: null, Icon: HandCoins },
    ],
  },
  {
    group: "Launchpad",
    items: [
      { href: "/curve/launch", label: "Launch a token", phone: null, Icon: Rocket },
      { href: "/curve", label: "All launches", phone: null, Icon: Sparkles },
    ],
  },
  {
    group: "Public",
    items: [
      { href: "/proof", label: "Proof", phone: null, Icon: ShieldCheck },
      { href: "/ledger", label: "Ledger", phone: null, Icon: ScrollText },
      { href: "/docs", label: "Docs", phone: null, Icon: BookOpen },
    ],
  },
] as const;

/** What the phone's More sheet lists: every destination that is not one of the four tabs, under its group. */
const MORE_GROUPS = NAV.map((g) => ({ group: g.group, items: g.items.filter((i) => i.phone === null) })).filter((g) => g.items.length > 0);
const MORE = MORE_GROUPS.flatMap((g) => g.items);

/** Every route the rail offers — the shell must survive all of them. Held by a test. */
export const RAIL_ROUTES: readonly string[] = NAV.flatMap((g) => g.items.map((i) => i.href));

function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  // Plans has its own item; pay in stock lights up for everything else under /app/org.
  if (href === "/app/org") return (pathname === "/app/org" || pathname.startsWith("/app/org/")) && !pathname.startsWith("/app/org/plans");
  // Launch a token has its own item; all launches lights up for the list and every launch's page.
  if (href === "/curve") return (pathname === "/curve" || pathname.startsWith("/curve/")) && !pathname.startsWith("/curve/launch");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppRail() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(false);
  const [more, setMore] = useState(false);
  const session = useSession();
  useEffect(() => setMore(false), [pathname]);
  // The sheet closes on Escape and on any tap outside it or its button.
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest(".app-rail-sheet, .app-rail-more")) setMore(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [more]);
  const moreOn = MORE.some((i) => isActive(i.href, pathname));

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
            {items.map(({ href, label, phone, Icon }) => {
              const on = isActive(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`app-rail-item${on ? " on" : ""}${phone ? " is-tab" : " is-desk"}`}
                  title={label}
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                >
                  <Icon size={19} strokeWidth={1.9} />
                  <span className="app-rail-label">{label}</span>
                  {phone ? <span className="app-rail-tab">{phone}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
        <button type="button" className={`app-rail-item app-rail-more${moreOn || more ? " on" : ""}`} aria-expanded={more} aria-controls="app-rail-more" onClick={() => setMore((m) => !m)}>
          {more ? <X size={19} strokeWidth={1.9} /> : <Ellipsis size={19} strokeWidth={1.9} />}
          <span className="app-rail-tab">More</span>
        </button>
      </nav>

      {more ? (
        <div id="app-rail-more" className="app-rail-sheet" role="dialog" aria-label="More">
          {MORE_GROUPS.map(({ group, items }) => (
            <div key={group} className="app-rail-sheet-group">
              <p className="app-rail-sheet-head">{group}</p>
              {items.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className={`app-rail-sheet-link${isActive(href, pathname) ? " on" : ""}`}>
                  <Icon size={18} strokeWidth={1.9} />
                  {label}
                </Link>
              ))}
            </div>
          ))}
          <p className="app-rail-sheet-who">{session.owner ? <>Signed in as <span className="mono">{short(session.owner)}</span></> : <Link href="/app">Sign in</Link>}</p>
        </div>
      ) : null}

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
            <span className="app-rail-sub">Your savings</span>
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
