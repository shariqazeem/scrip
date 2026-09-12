import type { ReactNode } from "react";
import "@/styles/app.css";

/**
 * The frame every shelled surface wears. `.wg-page` is the one class the app shell reserves
 * room for, so a page that forgets it renders under the mode pill — which is exactly the drift
 * Sage hit with four enumerated container selectors. One frame, one class, no list to sync.
 */
export function PageFrame({
  eyebrow,
  title,
  sub,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="wg-page">
      <header className="wg-page-head">
        <div>
          {eyebrow ? <p className="wg-page-eyebrow">{eyebrow}</p> : null}
          <h1 className="wg-page-title">{title}</h1>
          {sub ? <p className="wg-page-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="wg-empty-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

/**
 * The honest waiting state. It names what is missing and what would make it appear. It never
 * renders a placeholder number, because a number on a Webgold surface is a claim.
 */
export function EmptyState({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="wg-empty">
      <span className="wg-empty-mark" aria-hidden>
        {icon}
      </span>
      <p className="wg-empty-title">{title}</p>
      <p className="wg-empty-note">{note}</p>
      {children ? <div className="wg-empty-actions">{children}</div> : null}
    </div>
  );
}
