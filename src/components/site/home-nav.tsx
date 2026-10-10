import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { NavAccount, NavMenu } from "./nav-account";
import "@/app/front.css";

/**
 * THE PUBLIC NAV, ON PAPER — on the front page and every page a stranger reads. Scrip, For
 * teams, Launches (Scrip Curve), Proof, the way into your savings, and the one primary action,
 * Start saving. On a phone: the mark, your savings, and a menu for the rest. The dark floor's nav
 * lives only on /proof.
 *
 * On the front door itself the start is the hero, already on the screen, so the nav does not
 * repeat it; elsewhere it opens the front door at its top, never a scroll to an anchor.
 */
export function HomeNav({ front = false }: { front?: boolean } = {}) {
  return (
    <nav className="sp-home-nav" aria-label="Scrip">
      <Link href="/" className="sp-home-brand" aria-label="Scrip home">
        <Wordmark size={22} />
      </Link>
      <span className="sp-home-nav-spacer" />
      <Link href="/teams" className="sp-home-nav-link is-wide">
        For teams
      </Link>
      <Link href="/curve" className="sp-home-nav-link is-wide">
        Launches
      </Link>
      <Link href="/proof" className="sp-home-nav-link is-wide">
        Proof
      </Link>
      <NavAccount />
      {front ? null : (
        <Link href="/" className="sp-home-nav-save is-wide">
          Start saving
        </Link>
      )}
      <NavMenu />
    </nav>
  );
}
