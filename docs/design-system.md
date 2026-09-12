# Design system — port and re-tone

The goal you set: **the same quality as Sage's UI or better, one tone, different colours,
consistent across every page**, so that design effort stops being a cost and the week goes
into the product.

## The rule that made Sage's UI work

One token file. Every surface aliases it. No Tailwind utility classes anywhere.

Sage reached that only after five stylesheets drifted apart and ~116 raw colour literals
had to be replaced. We start where Sage ended:

- `src/styles/tokens.css` is the **only** place a colour, radius, shadow, spacing step,
  type size or duration is defined. It is written and lives in this repo already.
- A per-surface stylesheet may alias (`--brass: var(--accent);`) but must **never**
  redeclare a palette value.
- `globals.css` contains `@import "tailwindcss"` and nothing else. Tailwind is kept for
  **preflight only** — it is the reset the whole layout sits on. Never write a utility class.
- No emoji in UI. Lucide line icons only.

## The palette, and why these values

| Token | Value | Note |
| --- | --- | --- |
| `--bg` | `#faf8f4` | paper with a faint gold cast, warmer than Sage's `#fbfbf9` |
| `--ink` | `#1a1815` | warm near-black for app chrome |
| `--ink-warm` | `#171512` | public reading surfaces: landing, docs |
| `--accent` | `#9a6f1e` | burnished gold. Deep enough to pass contrast on paper, and deliberately **not** bright yellow, which reads cheap and goldbug |
| `--accent-strong` | `#7a5715` | hover/active |
| `--accent-soft` | `#fbf3e3` | wash for hover and selected rows |
| `--ok` / `--err` | `#15803d` / `#dc2626` | **money outcomes only**, never decoration |

One accent, used on every interactive and brand element. The discipline is what makes it
look expensive: a page with one accent colour and a lot of white space reads as a financial
document, which is exactly the register for a product about savings.

`--warn` sits in the same warm family as the accent. Use it rarely, and only for a held or
stale state.

## Pages to build, and their Sage ancestor

| Webgold page | Ported from | Notes |
| --- | --- | --- |
| `/` landing | Sage cinematic landing (`landing-v2.css`, scene components) | Hero left, live ledger right. Keep the "no fabricated feed" rule: an empty ledger renders an honest waiting state |
| `/assets` | `marketplace.css` | The explore surface: what you can hold, issuer named on every row, sponsored first positions surfaced |
| `/app` | `workspace.css` + `live.css` | The reserve: balance, positions, activity. Shelled |
| `/app/pay` | campaign/submit forms | One form, one confirm, one receipt |
| `/receipt/[sig]` | `sage-proof.css` (`/proof/<tx>`) | Public, anchored, openable by anyone |
| `/ledger` | `/explorer` | Public record of everything settled |
| `/docs/*` | `content.css` + `/docs` | Reading surface, warm ink |

## The shell

Ported directly from Sage's `src/components/shell/`:

- fixed hover-expand **left rail** at `left: 16px`, vertically centred, `z-index: 60`
- top-centre **mode pill**, two segments
- top-right **context pills** (network, balance)
- sets `html[data-app-shell="on"]`; shelled page containers get `padding-top: 78px`, and at
  `max-width: 1180px` they gain left padding for the rail; below `720px` the rail moves to
  a bottom bar and pages get `padding-bottom: 92px`

All shell motion uses the `--dur` and `--ease` tokens, so `prefers-reduced-motion`
collapses it with no per-component media query.

## Port checklist

1. `src/styles/tokens.css` — **done**, in this repo.
2. `globals.css` with `@import "tailwindcss"` only.
3. `layout.tsx`: Inter + JetBrains Mono via `next/font`, variables `--font-inter` and
   `--font-jetbrains-mono` on `<html>`; import `globals.css` then `tokens.css`.
4. Copy Sage's shell components and rename; swap the mode-pill segments to Webgold's.
5. Copy the per-surface stylesheets one page at a time, replacing every local palette
   declaration with an alias to a token. Do not bring a raw hex across.
6. Build the receipt page early. It is the thing screenshots get taken of.

## Rules that are not negotiable

- Numbers are mono with tabular figures. Amounts, addresses, hashes, dates.
- Green and red mean money settled or money failed. Nothing else may use them.
- Radii are 6, 10, 16. Pills are for status chips only.
- Two shadow tokens for ordinary elevation; prefer a 1px border and space over a shadow stack.
- Never render a number the chain cannot confirm.
