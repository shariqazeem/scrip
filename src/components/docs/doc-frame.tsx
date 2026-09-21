import Link from "next/link";
import type { ReactNode } from "react";
import { ScripMark } from "@/components/brand/scrip-mark";
import { DOC_PAGES } from "./pages";
import "@/app/docs/content.css";

export { DOC_PAGES };

/** The reading surface. Shell-exempt: a stranger reading about custody is not an owner. */
export function DocFrame({ eyebrow, title, lede, children, here }: { eyebrow: string; title: string; lede: ReactNode; children: ReactNode; here: string }) {
  return (
    <main className="sp-doc">
      <Link href="/" className="sp-doc-brand" aria-label="Scrip home">
        <ScripMark size={20} />
        Scrip
      </Link>
      <nav className="sp-doc-nav" aria-label="Docs">
        {DOC_PAGES.map((p) => (
          <Link key={p.href} href={p.href} className={p.href === here ? "on" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <p className="sp-doc-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
      {children}
    </main>
  );
}
