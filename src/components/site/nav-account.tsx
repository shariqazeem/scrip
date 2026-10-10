"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useSession } from "@/lib/session/use-session";

/**
 * THE WAY INTO YOUR SAVINGS, on every public page. Signed in, it says where it goes; signed
 * out, it says what it does. Read from the session after mount, because the nav heads pages
 * that must stay static; while the answer is pending the button keeps its width and says
 * nothing, so a signed-in owner never sees "Sign in" flash on their own screen.
 */
export function NavAccount() {
  const session = useSession();
  if (session.loading) {
    return (
      <span className="sp-home-nav-account is-pending" aria-hidden>
        Your savings
      </span>
    );
  }
  return session.owner ? (
    <Link href="/app" className="sp-home-nav-account is-in">
      <span className="dot" aria-hidden />
      Your savings
    </Link>
  ) : (
    <Link href="/app" className="sp-home-nav-account">
      Sign in
    </Link>
  );
}

const MENU = [
  { href: "/", label: "Start saving" },
  { href: "/app/save", label: "Save once" },
  { href: "/app", label: "Your savings" },
  { href: "/teams", label: "For teams" },
  { href: "/curve", label: "Launchpad" },
  { href: "/proof", label: "Proof" },
  { href: "/security", label: "Security" },
  { href: "/docs", label: "Docs" },
] as const;

/**
 * THE PHONE MENU. A phone's nav has room for the mark, the way into your savings and one
 * button; everything else a stranger might want sits one tap behind it. Closes on a choice,
 * on Escape and on a tap outside.
 */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="sp-home-nav-menu" ref={box}>
      <button type="button" className="sp-home-nav-menu-btn" aria-expanded={open} aria-controls="sp-home-menu" aria-label={open ? "Close the menu" : "Open the menu"} onClick={() => setOpen((o) => !o)}>
        {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
      </button>
      {open ? (
        <div id="sp-home-menu" className="sp-home-nav-sheet">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="sp-home-nav-sheet-link" onClick={() => setOpen(false)}>
              {m.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
