---
name: webgold-ui
description: The Webgold design system. Invoke before building or editing ANY user-facing surface — landing, app pages, the shell, receipts, docs, marketing. Carries the token contract, the page patterns ported from Sage, and the rules that keep every page one tone.
---

# Webgold UI

One system, "receipt minimalism" re-toned to burnished gold. Calm, premium-light,
print-like. The register is a financial document, not a trading terminal.

## Non-negotiable rules

1. **`src/styles/tokens.css` is the only place a value is defined.** Colour, radius,
   shadow, spacing step, type size, duration. A per-surface stylesheet may alias
   (`--brass: var(--accent);`); it must never redeclare a palette value. Never write a raw
   hex in a component or a page stylesheet.
2. **No Tailwind utility classes, ever.** `globals.css` is `@import "tailwindcss"` and
   nothing else — Tailwind is kept for preflight, which is the reset the layout sits on.
   Write real CSS in a per-surface file.
3. **Green and red mean money.** `--ok` is settled, received, verified. `--err` is failed
   or refused. Neither may be used as decoration, a chart colour, or a generic state.
4. **One accent.** `--accent` (`#9a6f1e`, burnished gold) on every interactive and brand
   element: links, primary buttons, focus rings, the mark. Restraint is what makes it read
   as expensive.
5. **Numbers are mono with tabular figures.** Amounts, balances, addresses, hashes, dates.
   `--font-mono`, `--fs-mono`. Body copy is Inter.
6. **Radii are 6 / 10 / 16.** `--r-pill` (999px) is for status chips only.
7. **No emoji in UI.** Lucide line icons, `size={14|15}`, `strokeWidth={2}`.
8. **Never render a number that chain state or a stored receipt cannot confirm.** An empty
   feed renders an honest waiting state, never a fabricated row.
9. **Server-first.** React Server Components by default; `"use client"` only at interactive
   leaves.
10. **Motion rides the tokens.** `--dur-1|2|3` and `--ease-out|spring` only, so
    `prefers-reduced-motion` collapses everything with no per-component media query.

## Token quick reference

```
surface   --bg #faf8f4   --surface #fff   --border #e8e2d6   --border-strong #d6cdbc
text      --ink #1a1815  --ink-warm #171512 (landing/docs)  --ink-muted #5c564c  --ink-faint #8d867a
brand     --accent #9a6f1e  --accent-strong #7a5715  --accent-soft #fbf3e3  --accent-ink #fff
money     --ok #15803d  --err #dc2626  --warn #b45309 (rare)  + *-soft and *-border rings
dark      --ink-inverse #f4f2ee  --surface-inverse-raised #2a2620  --border-inverse #322d26
type      --fs-display/h1/h2/lead/body/mono, each with its --lh-* and --tracking-*
space     --s-1..--s-12, 8pt rhythm (--s-1 = 4px is the half-step)
motion    --dur-1 160ms  --dur-2 320ms  --dur-3 640ms  --ease-out  --ease-spring
```

## Page patterns

| Surface | Pattern |
| --- | --- |
| Landing | Hero copy left, live ledger right. Warm ink. Generous whitespace on `--s-9`..`--s-12`. One dark section at the close using the inverse tokens |
| `/assets` | Row list, issuer named on every row, sponsored positions marked. Mono for prices |
| `/app` | Card grid on paper. Balance hero, positions list, activity tape. Under the shell |
| `/app/pay` | One form, one confirm, one receipt. No step wizard |
| `/receipt/[sig]` | Print-like, unshelled, screenshot-worthy. This is the artifact people share — build it early and make it the best page in the product |
| `/ledger` | Dense table, mono, tabular numerals, one row per settled event |
| `/docs/*` | Reading surface, warm ink, measure capped around 68ch |

## The shell

Fixed hover-expand left rail at `left: 16px`, vertically centred, `z-index: 60`.
Top-centre mode pill. Top-right context pills (network, balance). Sets
`html[data-app-shell="on"]`; shelled containers take `padding-top: 78px`, gain left padding
under 1180px, and below 720px the rail becomes a bottom bar with `padding-bottom: 92px`.

## Porting from Sage

Sage lives at `/Users/macbookair/projects/SAGE`. Its system is the ancestor and the quality
bar. When porting a surface:

- copy the structure and the class vocabulary, not the palette
- replace every local colour declaration with an alias to a Webgold token
- if a raw hex survives the port, that is a bug

Useful ancestors: `src/styles/tokens.css`, `src/components/shell/`,
`src/app/landing-v2.css`, `src/styles/marketplace.css`, `src/styles/workspace.css`,
`src/styles/live.css`, `src/app/sage-proof.css`, `src/app/content.css`.

## Before you finish a surface

- every colour is a token or an alias
- amounts and hashes are mono and tabular
- an empty state is honest and designed, not a spinner
- it holds at 375px, 768px and 1440px
- keyboard focus is visible and uses `--accent`
