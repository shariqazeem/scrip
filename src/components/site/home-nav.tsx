import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { NavAccount, NavMenu } from "./nav-account";
import "@/app/front.css";

/**
 * THE PUBLIC NAV, ON PAPER — on the front page and every page a stranger reads. Scrip, For
 * teams, Proof, the way into your savings, and the one primary action, Save. On a phone: the
 * mark, your savings, and a menu for the rest; the save card is already on the screen. The
 * dark floor's nav lives only on /proof.
 */
export function HomeNav() {
  return (
    <nav className="sp-home-nav" aria-label="Scrip">
      <Link href="/" className="sp-home-brand" aria-label="Scrip home">
        <Wordmark size={22} />
      </Link>
      <span className="sp-home-nav-spacer" />
      <Link href="/teams" className="sp-home-nav-link is-wide">
        For teams
      </Link>
      <Link href="/proof" className="sp-home-nav-link is-wide">
        Proof
      </Link>
      <NavAccount />
      <Link href="/#save" className="sp-home-nav-save is-wide">
        Save
      </Link>
      <NavMenu />
    </nav>
  );
}
