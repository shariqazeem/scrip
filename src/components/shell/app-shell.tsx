"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { House, Send, SlidersHorizontal } from "lucide-react";
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
 * TWO SEGMENTS, AND THEY ARE THE TWO THINGS AN OWNER DOES HERE: look at what arrived, or set
 * the rule. Everything else is a detail of one of those.
 */
function ModePill({ pathname }: { pathname: string }) {
  const onRule = pathname.startsWith("/app/rule");
  const onOrg = pathname.startsWith("/app/org");
  return (
    <div className="mode-pill" role="group" aria-label="Mode">
      <Link href="/app" className={`mode-seg${!onRule && !onOrg ? " on" : ""}`}>
        <House size={14} strokeWidth={2} /> Home
      </Link>
      <Link href="/app/rule" className={`mode-seg${onRule ? " on" : ""}`}>
        <SlidersHorizontal size={14} strokeWidth={2} /> Rule
      </Link>
      <Link href="/app/org" className={`mode-seg${onOrg ? " on" : ""}`}>
        <Send size={14} strokeWidth={2} /> Pay
      </Link>
    </div>
  );
}

export function AppShell() {
  const pathname = usePathname() ?? "";
  const active = isAppRoute(pathname);

  useEffect(() => {
    const el = document.documentElement;
    if (active) el.dataset.appShell = "on";
    else delete el.dataset.appShell;
    return () => {
      delete el.dataset.appShell;
    };
  }, [active]);

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
