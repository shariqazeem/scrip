import Link from "next/link";
import type { ReactNode } from "react";
import { WebgoldMark } from "@/components/brand/webgold-mark";
import { DOC_PAGES } from "./pages";
import "@/app/docs/content.css";

/**
 * The reading surface. Shell-exempt on purpose — see src/components/shell/routes.ts: a
 * stranger reading about custody should not be offered a rail link to "your book", which
 * promises an account they do not have.
 */
export { DOC_PAGES };

export function DocFrame({
  eyebrow,
  title,
  lede,
  children,
  here,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
  here: string;
}) {
  return (
    <main className="wg-doc">
      <Link href="/" className="wg-doc-brand" aria-label="Webgold home">
        <WebgoldMark size={20} />
        webgold
      </Link>

      <nav className="wg-doc-nav" aria-label="Docs">
        {DOC_PAGES.map((p) => (
          <Link key={p.href} href={p.href} className={p.href === here ? "on" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>

      <p className="wg-doc-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
      {children}
    </main>
  );
}
