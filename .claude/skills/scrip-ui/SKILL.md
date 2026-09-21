---
name: scrip-ui
description: The Scrip design system, "There is no opening bell". Invoke before building or editing ANY user-facing surface — the floor, the marketing map, the register, pay in stock, receipts, runs, grants, the public pages, docs, the shell. Carries the token contract, the two materials, the stub at five sizes, the words, the page patterns, and the rules that keep every page one tone.
---

# Scrip UI

**There is no opening bell.** The world of the old exchange floor, reborn without hours:
the tape is the live feed, the register is the personal record, the stub is the receipt,
the floor is the network, the keepers are the runners. Two materials, assigned by surface:
**ink** (the dark ground) for the floor — the front door's opening and close, the tape, the
printer, the market band, the marketing nav; **paper** for every document — the register,
the receipt, the statement, the pay page, the organisation's pages. Spend the boldness in
one place — the stub — and keep everything else quiet. A document, not a terminal.

## The words

| In code | On every surface |
| --- | --- |
| `Book` (a person's) | **register** — "your register", "make it public" |
| `Book` (`kind = Org`) | the organisation's **page** |
| `Receipt` when drawn | a **stub**; "prints" |
| `Payout` kind Settle / Sponsor | **pay** / **gift** |
| `Grant`, `vest` | a **grant that vests**; "vested", "next vest" |
| send | **pay in stock** |
| the network | **the floor**; the live line is **the tape** |

Never "token", never "yield", never "projected". Arithmetic on the past, labelled, is the
limit.

## Non-negotiable rules

1. **`src/styles/tokens.css` is the only place a value is defined.** Colour, radius, shadow,
   spacing step, type size, duration. A per-surface stylesheet may alias
   (`--line: var(--border);`); it must never redeclare a palette value. Never write a raw
   hex in a component or a page stylesheet.
2. **No Tailwind utility classes, ever.** `globals.css` is `@import "tailwindcss"` for
   preflight and nothing else. Write real CSS in a per-surface file, prefixed `sp-`.
3. **Green and red mean money.** `--ok` is settled or still held. `--err` is failed or
   refused. `--warn` is held, waiting, paused. None may be used as decoration.
4. **One accent.** `--accent` (`#2b4acb`, document blue) on every interactive and brand
   element: links, primary buttons, focus rings, the mark. On dark ground it is
   `--accent-inverse`; money outcomes on dark are `--ok-inverse` / `--err-inverse`.
   `--gold` is the chip colour for the one metal on the registry and nothing else.
   **The dark ground** (`--surface-inverse`) is for the front door's opening and close, the
   printer, the tape and the market band — the floor at night. Every document surface
   (the app, receipts, the pay page, the ledger) stays paper.
5. **Figures are mono with tabular numerals.** Amounts, units, addresses, hashes, dates.
   IBM Plex Mono. Words are Instrument Sans. **Units are the largest thing on any page they
   appear on.** Units before dollars.
6. **Radii are 6 / 10 / 16.** `--r-pill` (999px) is for status chips only.
7. **No emoji in UI.** Lucide line icons, `size={14|16}`, `strokeWidth={2}`.
8. **Never render a number that chain state or a stored receipt cannot confirm.** An empty
   feed renders an honest waiting state in words, never a sample row and never a zero
   standing in for "unknown". A worked example is labelled arithmetic. The only
   forward-looking sentence in the product is "about N more arrivals complete your first
   whole SPYx", computed from that register's own receipts and labelled as arithmetic.
9. **Server-first.** React Server Components by default; `"use client"` only at
   interactive leaves. The receipt page ships no client JavaScript except the copy button.
10. **Motion is a scene entering, never decoration.** The front door is a film: each
    section has one real object that enters when reached (`<Reveal>` adds `is-in`; the CSS
    of the object decides what that means — a stub prints, a bar fills, a figure rolls to
    its real value with `<Roll kind=…>`, a diagram plays). Text does not fade up on its own;
    hover changes colour, never position. App surfaces keep the one moment: the stub prints.
    Everything rides `--dur-1..4` and the two easings, so reduced motion collapses it all.
11. **Sentence case everywhere.** No all-caps eyebrows or stat labels, no accent-coloured
    word in a headline, no meta strings joined with middle dots, no arrows appended to
    buttons. Lines under 80 characters.
12. **Per-row disclosure, never a banner.** Every asset row says what is true of that mint.

## Token quick reference

```
surface   --bg #f7f5ef   --surface #fff   --border #e4dfd3   --border-strong #cdc5b4
text      --ink #14161c  --ink-muted #5a5d66  --ink-faint #8b8e97
brand     --accent #2b4acb  --accent-strong #1f3aa8  --accent-soft #e8edfb  --accent-ink #fff
money     --ok #15803d  --err #dc2626  --warn #b45309  + *-soft and *-border rings
metal     --gold #9a6f1e  --gold-soft  --gold-border            (the GOLD chip only)
type      --fs-display/h1/h2/lead/body/small/caption/mono, --fs-units, --fs-units-sm
space     --s-1..--s-12, 8pt rhythm;  --measure 720px;  --measure-wide 1040px
motion    --dur-1 160ms  --dur-2 320ms  --dur-3 640ms  --ease-out  --ease-spring
```

## The stub, at five sizes

`src/components/stub/stub.tsx` + `stub.css`. A white sheet on paper with a perforated top
edge (paper-coloured holes punched by a radial gradient), ruled rows, and the units at
`--fs-units`. Props: `landed`, `became`, `units`, `symbol`, `when`, `where`, `sections`.
`StubFromRow` builds one from a cached receipt row; the receipt page builds one from the
chain. `EmptyStub` says in words what will fill it. The five sizes, each the same object:

1. **the tape row** — one line on the floor (`components/floor/tape.tsx`)
2. **the wall stub** — compact, in the ledger's wall and the register
3. **the register stub** — full rows, printing at the top of `/app` as an arrival settles
4. **the receipt** — the hero of `/receipt/[sig]`, print-like
5. **the share card** — `opengraph-image` on `/receipt`, `/@handle`, `/run`, `/grant`

The favicon, the app icon and the mark are the stub glyph (`brand/scrip-mark.tsx`); the
wordmark is Fraunces (`brand/wordmark.tsx`), which appears in exactly two places: the
wordmark and a statement's title line.

## Page patterns

| Surface | Pattern |
| --- | --- |
| `/` | A film. Dark opening: the hero (headline, the front book printing under the printer, the scan-to-pay line), the tape, the mechanism (the last sweep replayed from its receipt, instruction by instruction), the market band with rolling figures. The paper tears off: the line; the three firsts, each a scene whose object enters (a stub prints, the rule plate fills, a receipt draws itself); the evidence as bars; the honesty rows; the record with rolling counters and three stubs printing. Dark close |
| `/pay/[handle]` | Two tabs — in stock, in USDC — then two columns: the form left, the quote or the transfer QR right. Unshelled |
| `/receipt/[sig]` | The stub as the hero, then two sheets: what arrived (issuer chips), where it is anchored. Unshelled, print-like |
| `/claim/[payer]/[rid]` | One heading, one action. Unshelled |
| `/ledger` | Aggregates as a ruled strip, then a wall of compact stubs. Shelled |
| `/keepers` | Scrip's keeper's health, the roster from receipts, can/cannot rows, run-one. Shelled |
| `/@handle` | A person's live register, read-only, opt-in; or an organisation's page (pays in stock since, people paid, runs, grants vesting, every payment with its reason). Unshelled; `opengraph-image` is the proof-of-saving card or the "pays in stock" card |
| `/run/[id]`, `/grant/[pda]` | Public records: a run's lines, a grant's schedule as a bar with vested so far and the next vest. Unshelled; each has an `opengraph-image` |
| `/floor` | The tape on ink: every stub as it prints over SSE, the slept share, the keepers, the corporate actions. Shelled |
| `/people`, `/teams`, `/grants`, `/company`, `/security`, `/bounties`, `/changelog`, `/brand`, `/actions` | The marketing map: `SiteFrame` (dark nav, perforated seam, paper body), `SiteSection` with a label and an aside, `Row` for facts. Facts are stated, never animated in |
| `/app/org/*` | Pay in stock: forms that say what happens in the same words as their button; a run is a file preview then one signature; a grant is a schedule then one signature; results are receipts, linked |
| `/app/statements/[ym]` | A month as the stub: statement head, the title in Fraunces, ruled facts, every line; prints to one page (`print-button.tsx`, `statement.css` print rules) |
| `/m/@handle/[id]` | A moment: one line, the stub that crossed it, the register it belongs to. Understated — no badge, no confetti, no rank. Unshelled; the `opengraph-image` is that stub beside that line |
| `/assets` | Row list, issuer named on every row, powers as chips. Shelled |
| `/app` | The rule in one line, the watching line, actions; the story (landed, became, units, worth today, the staircase); the register with the ghost stub; holdings, still-held, the pay link last |
| `/app/rule` | One question, answerable before any wallet: three large presets and another rate; handle and asset as ruled rows; everything with a default folded; the wallet is asked for only at the moment of signing, and the answer survives the popup |
| `/docs/*` | Reading surface, measure capped at 720px |

## The shell

Fixed hover-expand left rail at `left: 16px`, vertically centred, `z-index: 60`. Top-centre
mode pill (Home / Rule) with a paper scrim behind it on phones. Top-right network chip.
Sets `html[data-app-shell="on"]`; shelled containers wear `.sp-page`. Below 720px the rail
becomes a bottom bar and pages take `padding-bottom: 92px`. `/pay`, `/receipt`, `/claim`,
`/@handle`, `/run`, `/grant` and `/docs` are unshelled: the visitor is not the owner.
**⌘K** (`shell/jump.tsx`) opens on every page and resolves a handle, a signature, a run id,
a grant address or a page name from its shape (`jump-resolve.ts`, held by a test that reads
the filesystem for every page it offers).

## Motion, where it is allowed

`<Reveal>` adds `is-in` when a scene is **reached** — its top has crossed the bottom of the
window, which is also true of everything already scrolled past. It is a scroll check, not an
IntersectionObserver: an observer misses a scene that is jumped over, and a missed scene is
invisible content. No per-scene threshold, and a page that cannot scroll shows everything.
`.sp-truth`, `.sp-seven`, the bars and the stubs on the front door hide until then, and only
under `:where(html[data-js])` — `:where()` because it adds no specificity, so every `.is-in`
rule still wins. **Only the front door does this.** A document page (`SiteFrame`) states its
facts with no entrance (`site.css` resets `.sp-truth`); a register prints one stub at a time;
nothing else fades up.

**Whatever is hidden by default must be revealed by something that cannot fail to run.**

## Every state, designed

| State | What Scrip does |
| --- | --- |
| Loading | `SkeletonPage` / `SkeletonRows`: the real layout with ruled bars, never a spinner and never a bar that reads as a figure. One `loading.tsx` per shelled route |
| Empty | `EmptyState`: what will fill it, in words. Never a sample row, never a zero standing in for unknown |
| Paused | The register names the cause: revoked, delegate replaced, allowance out, float empty, no keeper |
| In flight | One toast, bottom left (`components/toast`): building, waiting for your wallet, confirming, settled, not sent — the same words as the button. Settled links the object and leaves after six seconds; a failure stays until dismissed |
| Success | The object appearing. Never a green banner |
| Error | `app/error.tsx` says what happened and offers the one action that might work; `not-found.tsx` offers four places to go; `global-error.tsx` works with no tokens at all |
| Offline | The register renders from the last answer this browser received and says the time it is showing (`components/app/offline.tsx`, `public/sw.js`) |

## Before you finish a surface

- every colour is a token or an alias
- units and hashes are mono and tabular; units are the largest thing on the page
- an empty state is honest and designed, not a spinner and not a sample
- it holds at 375px, 768px and 1440px; nothing runs under the bottom bar or the mode pill
- keyboard focus is visible and uses `--accent`; AA contrast; reduced motion respected
- every button says what happens, and the confirmation uses the same word
