"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { HandCoins, House, PiggyBank, Rocket, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { ServiceWorker } from "@/components/app/offline";
import { AppRail } from "./app-rail";
import { NetworkChip } from "./network-chip";
import { isAppRoute } from "./routes";
import "./app-shell.css";

/**
 * The one global app shell: a hover rail, a top-centre mode pill, and a top-right context
 * pill. Mounted once in the root layout and shown only on app routes. Sets
 * `html[data-app-shell="on"]` so page content clears the fixed chrome.
 *
 * THE PILL IS THE SECTION YOU ARE IN, so nobody has to wonder where they are. Your savings (and
 * every public page): look at what you own, save now, save every payment. For teams: pay in
 * stock, match savers. The launchpad: every launch, launch a token. The rail carries all of it;
 * the pill only says which part this page belongs to and its neighbours. On a phone the bottom
 * bar carries the doors, so the pill is a computer's only.
 */
type Seg = { href: string; label: string; Icon: typeof House; on: boolean };
type Section = "savings" | "teams" | "launchpad";

export function sectionOf(pathname: string): Section {
  if (pathname === "/curve" || pathname.startsWith("/curve/")) return "launchpad";
  if (pathname === "/app/org" || pathname.startsWith("/app/org/")) return "teams";
  return "savings";
}

function segmentsFor(pathname: string): Seg[] {
  const section = sectionOf(pathname);
  if (section === "launchpad") {
    const launching = pathname.startsWith("/curve/launch");
    return [
      { href: "/curve", label: "All launches", Icon: Sparkles, on: !launching },
      { href: "/curve/launch", label: "Launch a token", Icon: Rocket, on: launching },
    ];
  }
  if (section === "teams") {
    const plans = pathname.startsWith("/app/org/plans");
    return [
      { href: "/app/org", label: "Pay in stock", Icon: Send, on: !plans },
      { href: "/app/org/plans", label: "Match savers", Icon: HandCoins, on: plans },
    ];
  }
  return [
    { href: "/app", label: "Home", Icon: House, on: pathname === "/app" },
    { href: "/app/save", label: "Save now", Icon: PiggyBank, on: pathname.startsWith("/app/save") },
    { href: "/app/rule", label: "Every payment", Icon: SlidersHorizontal, on: pathname.startsWith("/app/rule") },
  ];
}

function ModePill({ pathname }: { pathname: string }) {
  return (
    <div className="mode-pill" role="group" aria-label="This section">
      {segmentsFor(pathname).map(({ href, label, Icon, on }) => (
        <Link key={href} href={href} className={`mode-seg${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
          <Icon size={14} strokeWidth={2} /> {label}
        </Link>
      ))}
    </div>
  );
}

export function AppShell() {
  const pathname = usePathname() ?? "";
  const active = isAppRoute(pathname);

  const section = sectionOf(pathname);

  useEffect(() => {
    const el = document.documentElement;
    if (active) {
      el.dataset.appShell = "on";
      // On a phone the pill shows only for a section whose pages the bottom bar does not carry.
      el.dataset.appSection = section;
    } else {
      delete el.dataset.appShell;
      delete el.dataset.appSection;
    }
    return () => {
      delete el.dataset.appShell;
      delete el.dataset.appSection;
    };
  }, [active, section]);

  if (!active) return null;
  return (
    <>
      <ServiceWorker />
      <AppRail />
      <div className="mode-scrim" aria-hidden />
      <ModePill pathname={pathname} />
      <div className="ctx-pills">
        <NetworkChip />
      </div>
    </>
  );
}
