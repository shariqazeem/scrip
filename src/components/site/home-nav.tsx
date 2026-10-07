import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import "@/app/front.css";

/**
 * THE PUBLIC NAV, ON PAPER — the same four doors on the front page and every page a stranger
 * reads: Scrip, For teams, Proof, and the one primary action, Save. The dark floor's nav lives
 * only on /proof.
 */
export function HomeNav() {
  return (
    <nav className="sp-home-nav" aria-label="Scrip">
      <Link href="/" className="sp-home-brand" aria-label="Scrip home">
        <Wordmark size={22} />
      </Link>
      <span className="sp-home-nav-spacer" />
      <Link href="/teams" className="sp-home-nav-link">
        For teams
      </Link>
      <Link href="/proof" className="sp-home-nav-link">
        Proof
      </Link>
      <Link href="/#save" className="sp-home-nav-save">
        Save
      </Link>
    </nav>
  );
}
