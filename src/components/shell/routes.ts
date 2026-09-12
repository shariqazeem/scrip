/**
 * WHERE THE APP SHELL LIVES — one definition, imported by both the rail and the shell.
 *
 * THE RULE: if the rail links to it, the rail survives it. A nav item that makes its own
 * chrome disappear is worse than no nav item — you arrive somewhere with no way back but the
 * logo. In Sage that rule lived as a comment beside a regex in one file while the nav lived in
 * another, so it held for one route and quietly failed for the next. Here it is one module,
 * compared by a test (`routes.test.ts`).
 *
 * THREE DELIBERATE EXEMPTIONS, all for the same reason — the visitor is not the owner:
 *
 *   `/`            the landing carries its own public nav.
 *   `/receipt/...` the most-shared thing Webgold produces, usually opened by someone who has
 *                  never heard of it. Wrapping a receipt in owner chrome that offers "Pay"
 *                  turns an artifact into an advert. It is built print-like and unshelled.
 *   `/docs/...`    a reading surface with its own sidebar; offering a stranger a link to
 *                  "your book" promises an account they do not have.
 */

/** Route prefixes that get the shell. The rail's own links must all match one of these. */
const SHELLED = [
  /^\/app(\/|$)/,
  /^\/assets(\/|$)/,
  /^\/ledger(\/|$)/,
] as const;

export function isAppRoute(p: string): boolean {
  return SHELLED.some((re) => re.test(p));
}

/** The routes the rail offers that deliberately have no shell. Held by a test. */
export const SHELL_EXEMPT: readonly string[] = ["/docs"];
