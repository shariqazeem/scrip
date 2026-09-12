# What to reuse from Sage, and what to leave behind

Sage lives at `/Users/macbookair/projects/SAGE`. It is the quality bar and the source of
craft. It is **not** a dependency, and nothing in Webgold's pitch, docs or demo mentions it.

The rule: **port patterns and chrome, never product logic.** Sage judges work on EVM and
Starknet rails. Webgold settles value on Solana and judges nothing. Anything that encodes
"who deserves money" stays where it is.

## Copy these, adapting as noted

| From Sage | What it gives you | Adaptation |
| --- | --- | --- |
| `src/styles/tokens.css` | the whole design contract | **already ported and re-toned** — burnished gold, warm paper |
| `src/app/globals.css` | Tailwind preflight only, no utilities | copy as-is |
| `src/app/layout.tsx` | Inter + JetBrains Mono via `next/font`, variables on `<html>` | keep the font wiring, drop everything else |
| `src/components/shell/app-shell.tsx`, `app-rail.tsx`, `app-shell.css`, `routes.ts` | fixed hover rail, top-centre mode pill, context pills, `html[data-app-shell="on"]` | rename the pill segments; keep every dimension and every `--dur`/`--ease` token |
| `src/lib/db/index.ts` | lazy drizzle + better-sqlite3 proxy, WAL, migrations on first query so `next build` never opens the file | change the env var and the filename |
| `src/lib/db/keys.ts` | `nanoid` ids and `nowSeconds()` | copy as-is |
| `src/lib/format.ts` | `usd`, `short`, `since` | add `grams` and `oz` |
| `vitest.config.ts` + `vitest.setup.ts` | `server-only`/`client-only` aliased to an empty module, `pool: "forks"` with per-file isolation, in-memory SQLite per file | copy as-is. This is what makes the suite contention-safe |
| `tsconfig.json` | strict, `@/*` path alias, bundler resolution | copy as-is |
| `eslint.config.mjs` | next + typescript + prettier, sane ignores | copy as-is |
| `src/app/proof/[tx]/` + `src/app/sage-proof.css` | the receipt page: print-like, unshelled, built to be screenshotted | this becomes `/receipt/[sig]`. The most valuable single port |
| `src/app/explorer/` | the public record page | becomes `/ledger`, aggregates plus an event stream |
| `src/styles/marketplace.css` | dense row lists | becomes `/assets` |
| `src/styles/workspace.css`, `live.css` | card grids, activity tapes, telemetry chips | becomes `/app` |
| `src/app/content.css` | reading surface, warm ink, capped measure | becomes `/docs` |
| `src/app/landing-v2.css` + `src/components/landing/` | the cinematic landing structure | keep the structure and whitespace scale, replace every colour with a token |

## Port these habits, they are worth more than the code

- **Failure returns a value, never throws for control flow.** A stale price, a missing
  multiplier, a failed quote: each holds and says why. This is the reason a failed judgment
  never corrupted a payout in Sage.
- **Receipt religion.** Every money move has an openable page anchored to a real
  transaction. Nothing is claimed that cannot be opened.
- **Two lists that drift is the dominant defect shape.** Whenever a value is declared in two
  places, write the test that reads both. Sage has structural tests that read source files
  directly (`attach-callers.test.ts`, `route-exports.test.ts`) precisely for this.
- **Never render a number the chain cannot confirm.** An empty feed gets an honest, designed
  waiting state, never a fabricated row.
- **Money-critical code requires tests before it is considered done.**
- **`after()` for post-response work** so a slow side effect never blocks a response.
- **One token file, aliases everywhere, zero Tailwind utility classes.** Sage reached this
  only after five stylesheets drifted and ~116 raw colour literals had to be replaced.

## Never port these

Anything under `src/lib/deputy/` (the judge), `src/lib/launch/` (mission design and browser
verification), the x402 rail, the Telegram concierge, the Privy mandate builder, and the
EVM/Starknet chain registry. Webgold does not judge work, does not design missions, does not
run a browser, and does not touch those chains. Copying any of it would drag in a second
product's worldview.

## A note on the mandate pattern

Sage's `buildMandatePolicy` binds an agent wallet to rules it cannot exceed. Do not copy the
code, which is Privy and EVM specific. Do copy the **shape**: the policy is signed once, the
program enforces it, and the software executing has no discretion. That is exactly how
recipient policies and goal vaults work here.
