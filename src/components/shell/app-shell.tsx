"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { House, Send } from "lucide-react";
import { AppRail } from "./app-rail";
import { NetworkChip } from "./network-chip";
import { isAppRoute } from "./routes";
import "./app-shell.css";

/**
 * The one global app shell: a hover rail, a top-centre mode pill, and top-right context pills.
 * Mounted once in the root layout and shown only on app routes. Sets
 * `html[data-app-shell="on"]` so page content clears the fixed chrome (see app-shell.css).
 *
 * The landing, every receipt and the docs get nothing — see routes.ts for why each one is out.
 */

/**
 * TWO SEGMENTS, AND THEY ARE THE TWO THINGS A PERSON DOES HERE: look at what they own, or move
 * value. Everything else in the product is a detail of one of those.
 */
function ModePill({ pathname }: { pathname: string }) {
  const onPay = pathname.startsWith("/app/pay");
  return (
    <div className="mode-pill" role="group" aria-label="Mode">
      <Link href="/app" className={`mode-seg${onPay ? "" : " on"}`}>
        <House size={14} strokeWidth={2} /> Book
      </Link>
      <Link href="/app/pay" className={`mode-seg${onPay ? " on" : ""}`}>
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
      <AppRail />
      <ModePill pathname={pathname} />
      <div className="ctx-pills">
        <NetworkChip />
      </div>
    </>
  );
}
