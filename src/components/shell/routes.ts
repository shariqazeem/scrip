/**
 * WHERE THE APP SHELL LIVES — one definition, imported by both the rail and the shell.
 *
 * THE RULE: if the rail links to it, the rail survives it. A nav item that makes its own
 * chrome disappear is worse than no nav item. One module, compared by a test.
 *
 * THE EXEMPTIONS, all for the same reason — the visitor is not the owner:
 *
 *   `/`             the landing carries its own public nav.
 *   `/pay/…`        a payer with no account; owner chrome offering "your book" is noise.
 *   `/@handle`      a person's or an organisation's public page, watched by strangers.
 *   `/run/…`        a payroll run; `/grant/…` a grant: both public records.
 *   `/receipt/…`    the most-shared thing Scrip produces, opened by strangers. Print-like.
 *   `/claim/…`      somebody with an empty wallet and one thing to do.
 *   `/docs/…`       a reading surface with its own nav.
 */
const SHELLED = [/^\/app(\/|$)/, /^\/assets(\/|$)/, /^\/ledger(\/|$)/, /^\/keepers(\/|$)/, /^\/floor(\/|$)/] as const;

export function isAppRoute(p: string): boolean {
  return SHELLED.some((re) => re.test(p));
}

/** The routes the rail offers that deliberately have no shell. Held by a test. */
export const SHELL_EXEMPT: readonly string[] = ["/docs"];
