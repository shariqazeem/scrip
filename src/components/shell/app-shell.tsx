"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { House, PiggyBank, SlidersHorizontal } from "lucide-react";
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
 * THREE SEGMENTS, THE THREE THINGS A SAVER DOES HERE: look at what they own, save now, and
 * save every payment. Paying someone in stock is the payer's side and lives in the rail. On a
 * phone the bottom bar carries the same doors, so the pill is a computer's only.
 */
function ModePill({ pathname }: { pathname: string }) {
  const onRule = pathname.startsWith("/app/rule");
  const onSave = pathname.startsWith("/app/save");
  const onHome = pathname === "/app";
  return (
    <div className="mode-pill" role="group" aria-label="Mode">
      <Link href="/app" className={`mode-seg${onHome ? " on" : ""}`}>
        <House size={14} strokeWidth={2} /> Home
      </Link>
      <Link href="/app/save" className={`mode-seg${onSave ? " on" : ""}`}>
        <PiggyBank size={14} strokeWidth={2} /> Save now
      </Link>
      <Link href="/app/rule" className={`mode-seg${onRule ? " on" : ""}`}>
        <SlidersHorizontal size={14} strokeWidth={2} /> Every payment
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
