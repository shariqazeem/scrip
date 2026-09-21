# Design system — the receipt

**The subject is a receipt.** Paper, ink, ruled ledger lines, and the perforated edge of a
pay stub. Spend the boldness in one place, the stub, and keep everything else quiet. The
register is a financial document, not a trading terminal.

## The rule that made the predecessor's UI work, kept

One token file. Every surface aliases it. No Tailwind utility classes anywhere.

- `src/styles/tokens.css` is the **only** place a colour, radius, shadow, spacing step,
  type size or duration is defined.
- A per-surface stylesheet (`landing.css`, `app.css`, `pay.css`, `receipt.css`,
  `content.css`, `stub.css`, `app-shell.css`) may alias (`--line: var(--border);`) but
  never redeclares a palette value. Classes are prefixed `sp-`.
- `globals.css` contains `@import "tailwindcss"` for preflight and nothing else.
- No emoji in UI. Lucide line icons only.

## The palette, and why these values

| Token | Value | Note |
| --- | --- | --- |
| `--bg` | `#f7f5ef` | paper |
| `--surface` | `#ffffff` | the sheet |
| `--ink` | `#14161c` | one ink, everywhere |
| `--ink-muted` / `--ink-faint` | `#5a5d66` / `#8b8e97` | secondary and captions |
| `--border` / `--border-strong` | `#e4dfd3` / `#cdc5b4` | a ruled line; a heavier rule |
| `--accent` | `#2b4acb` | document blue, on every interactive and brand element |
| `--accent-strong` / `--accent-soft` | `#1f3aa8` / `#e8edfb` | hover; wash |
| `--ok` / `--err` / `--warn` | `#15803d` / `#dc2626` / `#b45309` | **money outcomes only**: settled and still held; failed; held or paused |
| `--gold` | `#9a6f1e` | the GOLD chip, and nothing else |

The accent left gold and the type left Inter because the subject is a receipt, not
bullion (`docs/decisions.md`, 2026-09-15).

## Type

Words: **Instrument Sans**, 400 / 500 / 600. Figures: **IBM Plex Mono**, tabular, at every
size. Units are the largest thing on any page they appear on (`--fs-units`). Lines under 80
characters. Sentence case everywhere: no all-caps eyebrows or stat labels.

## Layout

Left-aligned. A 720px reading column (`--measure`); 1040px for a two-column surface
(`--measure-wide`). The stub is a white sheet on paper with a perforated top edge. Rules
encode rows. No decorative borders, no grid of identical cards with the same shadow, no
gradient washes.

## Motion

One moment: when a conversion lands, the stub prints — a single rise on `--dur-2` and
`--ease-spring`. Nothing fades up on scroll. Hover changes colour, not position.
`prefers-reduced-motion` zeroes the duration tokens.

## Copy

Active voice. A button says what happens — *Turn on the rule*, *Pause*, *Pay $200*, *Claim
into your wallet* — and the confirmation uses the same word. Errors say what happened and
what to do; empty states say what will fill them. Units before dollars.

**Gone:** the single accent-coloured word in a headline; all-caps eyebrows; meta strings
joined with middle dots; arrows appended to buttons; fade-and-slide on every section; hover
lifts on every card.

## The shell

A fixed hover-expand left rail (Home, Rule, Request, Send · Assets, Ledger, Docs), a
top-centre mode pill (Home / Rule) with a paper scrim behind it on phones, a top-right
network chip. `/pay`, `/receipt`, `/claim` and `/docs` are unshelled: the visitor is not the
owner. Below 720px the rail becomes a bottom bar; shelled pages take `padding-bottom: 92px`.

## Floor

375px works: the mode pill has a scrim, stats reflow to one column, nothing runs under the
bottom bar, the body never scrolls horizontally. Visible focus in the accent, AA contrast.
The receipt page ships no client JavaScript except the copy button.
