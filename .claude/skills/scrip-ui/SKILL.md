---
name: scrip-ui
description: The Scrip design system after the final plan (save now, then every payment, then the match). Invoke before building or editing ANY user-facing surface — the front door and the save sheet, receipts, your savings, every payment, pay in stock, runs, grants, the public pages, /proof, docs, the shell. Carries the token contract, paper everywhere and ink only on /proof, the words (consumer and proof), the page patterns, and the rules that keep every page one tone.
---

# Scrip UI

**Since 2026-10-07 (the final plan, `docs/SCRIP-SAVE-PLAN.md`): one job first.** A person
meets **save now** on paper, a receipt in seconds, and only then the two asks: "do this with
every payment" and "ask whoever pays you to match it". **Paper `#f7f5ef` on every consumer
screen** — the front door, the save sheet, the receipt, the register (now "your savings"),
every marketing page with the paper nav (`components/site/home-nav.tsx`). **Ink only on
`/proof`**, which is where the old front door now lives: the floor, the tape, the printer,
the keepers, the market band, the mechanism replay, keep-rate, the seven firsts.

The old metaphor still names things in code and on `/proof`: the tape is the live feed, the
stub is the receipt's shape, the floor is the network, the keepers are the runners. Spend
the boldness in one place — the receipt — and keep everything else quiet.

## The words

| In code | On a consumer surface | On `/proof` and in Proof drawers |
| --- | --- | --- |
| `Book` (a person's) | **your savings**; "your savings record" when the account must be named | register |
| `Book` (`kind = Org`) | the organisation's **page** | page |
| the rule, `enable_rule` | **save every payment**; "Save 10% of every payment" | the rule |
| a sweep | **saved**, "an automatic save" | sweep |
| the delegate allowance | **limit**: "Scrip can move at most $200" | allowance |
| `revoke`, pause | **stop saving** | revoke |
| the float | **prepaid saves** | float |
| a handle | **name, optional** | handle |
| SPYx, NVDAx | **S&P 500, Nvidia**; ticker and issuer in small type (`lib/save/names.ts`, the catalogue) | the symbol |
| keeper, crank, permissionless, tip, relayer | **never, anywhere a person or a judge reads** — not on `/proof`, not in docs, not in the README. Say "Scrip saves it", "saved automatically", "Scrip's servers" where the actor must be named, "the fee for submitting it" for the tip | never either. `/keepers` is an operators-only page |
| watermark, slot, band, keep-rate | never | as is |
| `Receipt` when drawn | a **receipt**; the stub is its shape | a stub; "prints" |
| `Payout` kind Settle / Sponsor | **pay** / **gift** | pay / gift |
| `Grant`, `vest` | a **grant that vests** | grant, vest |
| send | **pay in stock** | pay in stock |

Never "token" as a pitch word, never "yield", never "projected", never "401(k)", "pension",
"guaranteed" or "floor price". A hand-paid amount is never a "match": that word belongs to a
Plan's `match_receipt`. Arithmetic on the past, labelled, is the limit.

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
   **The dark ground** (`--surface-inverse`) is for `/proof` only: the floor at night, the
   printer, the tape, the market band. Every consumer surface stays paper, the front door
   included. Green on a consumer screen is only money a sponsor added (or a settled state).
5. **Figures are tabular.** On a consumer screen, amounts and units are Instrument Sans with
   tabular numerals, body at 17 px; IBM Plex Mono is for addresses, hashes, raw units and the
   Proof drawers. On a receipt the units are the largest thing on the page; in the save flow
   the dollars lead, with the viewer's own money beside them (`components/save/local-amount.tsx`).
6. **Radii are 6 / 10 / 16.** `--r-pill` (999px) is for status chips only.
7. **No emoji in UI.** Lucide line icons, `size={14|16}`, `strokeWidth={2}`.
8. **Never render a number that chain state or a stored receipt cannot confirm.** An empty
   feed renders an honest waiting state in words, never a sample row and never a zero
   standing in for "unknown". A worked example is labelled arithmetic. The only
   forward-looking sentence in the product is "about N more arrivals complete your first
   whole SPYx", computed from that register's own receipts and labelled as arithmetic.
9. **Server-first.** React Server Components by default; `"use client"` only at
   interactive leaves. A receipt ships only its small leaves: local time, local money, share.
10. **Motion is a scene entering, never decoration.** The front door is a film: each
    section has one real object that enters when reached (`<Reveal>` adds `is-in`; the CSS
    of the object decides what that means — a stub prints, a bar fills, a figure rolls to
    its real value with `<Roll kind=…>`, a diagram plays). Text does not fade up on its own;
    hover changes colour, never position. App surfaces keep the one moment: the stub prints.
    Everything rides `--dur-1..4` and the two easings, so reduced motion collapses it all.
11. **Sentence case everywhere.** No all-caps eyebrows or stat labels, no accent-coloured
    word in a headline, no meta strings joined with middle dots, no arrows appended to
    buttons. Lines under 80 characters.
12. **Per-row disclosure, never a banner.** Every asset row says what is true of that mint:
    the issuer's line from its own documents and the powers read off the mint (`disclosure()`
    in `lib/save/catalogue.ts`).
13. **One job per screen, and a trust line above every signature.** One primary button. Before
    a wallet opens: what moves, what it becomes, the least it can become, the fee in cents,
    what the issuer can do. Above the rule's signature: "Your stock stays in your wallet. Scrip
    can move at most $200 … and cannot raise that limit without a new signature."
14. **Targets are at least 44 × 44 px**, a phone gutter is 16 px, and nothing jumps as it
    loads: a line whose content arrives late reserves its height.

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
| `/` | **Start saving**, on paper. The paper nav (Scrip, For teams, Proof, "Sign in" or "Your savings"; on a phone the mark, your savings and a menu). Headline and lede beside the start card (`components/start/start-card.tsx`): one question (5%, 10%, 20% of every payment), the worked example (the wallet's own last payment when known), Into (the stocks that can settle an automatic save now, the default first, a waiting note when the chosen one cannot), "and start with a first save now" ($5 / $10 / $25 and what it becomes), a sponsor's match in green when the wallet was invited, the trust line, ONE button "Start saving 10%", the issuer and what starting sets aside. Under the card: "Just want to save once?" to `/app/save`. Then one real receipt, why once is enough (the evidence), the teams line, "before you save", a link to /proof. Wallet prompts: at most two (sign in, approve), and the approval does everything |
| the save sheet | A native `<dialog>`, a bottom sheet on a phone: the income line if it was not chosen, "Saving $5 of USDC from this wallet into Nvidia, in this wallet", You get / At the least / Network fee / First time (a deposit that comes back) / What it is, the trust line, one button "Approve in wallet". No wallet in the browser on a phone: "Open in Phantom / Solflare / Backpack" |
| the search | A dialog: company first, ticker and issuer small, "Saves automatically" on the eleven |
| `/receipt/[sig]`, a save | The stub prints on a fresh save; "Saved <local time>"; Share and Save again; the two asks ("Do this with every payment: 10%", "Ask whoever pays you to match it"); a Proof drawer (transaction, saver, memo, mark, route, against Pyth, fee, deposit, raw units, slot); what it is |
| `/receipt/[sig]`, a program receipt | The stub as the hero, then two sheets: what arrived (issuer chips), where it is anchored. Unshelled, print-like |
| `/proof` | The old front door, on ink: the hero "The proof, read from the chain", the front book printing, the floor, the mechanism, the seven firsts, the evidence, the honesty rows, the record, the dark close |
| `/app/rule` | "Save part of every payment, by itself." **Not saving yet (signed out or no record): the start card, nothing else.** Already saving: the editor — the rate (5%, 10%, 20%, another), Into, Limits folded (limit, most per payment, keep at least, price protection, add 1% every three months up to 50%), stop, prepay more; one button that names the change |
| `/app` | **Your savings.** Signed out: sign in (one prompt where the wallet can sign in by itself), then "New to Scrip? Start here." with the start card. Signed in with nothing set up: the start card is the first thing. Signed in: what the wallet owns (every catalogue stock, worth at Jupiter's price, saved with Scrip, added for you in green), a Plan's membership, **Your next step** (ask whoever pays you, until a receipt or a Plan says it is done), then the live record ("You save 10% of every payment into Nasdaq 100", the watching line, Stop saving, receipts; the page refreshes itself when a receipt prints), then saved now |
| `/app/save` | The save card inside the app, beside "before you sign". No sign-in needed: the save is the wallet's own transaction |
| `/teams` | Paper. The saver's ask when `?from=` carries a name; "Match what they save, with a Plan" first, then what else a team can do; "Start a Plan" is the primary button; what it costs |
| `/app/org/plans` | A sponsor's Plans as cards (terms in one sentence, in the escrow, matched so far, people; invite by name or address; remove; close only when nobody is left), then "Start a Plan": name, paid in, 25 / 50 / 100%, most per person a month, put in now, the trust line, one button "Open the Plan" |
| `/pay/[handle]` | Two tabs — in stock, in USDC — then two columns: the form left, the quote or the transfer QR right. Unshelled |
| `/claim/[payer]/[rid]` | One heading, one action. Unshelled |
| `/ledger`, `/keepers`, `/floor`, `/actions` | Reached from `/proof`. Shelled; machine words allowed |
| `/@handle`, `/run/[id]`, `/grant/[pda]`, `/m/@handle/[id]` | Public records, unshelled, each with an `opengraph-image` |
| marketing pages | `SiteFrame`: the paper nav, `SiteSection` with a label, `Row` for facts. Facts are stated, never animated in |
| `/app/statements/[ym]` | A month as the stub: statement head, the title in Fraunces, ruled facts, every line; prints to one page |
| `/docs/*` | Reading surface, measure capped at 720px |

## The shell

Fixed hover-expand left rail at `left: 16px`, vertically centred, `z-index: 60`: Your savings
(Home, Save now, Every payment, Receipts, Stocks, Statements, Settings, Pay in stock) and
Public (Proof, Ledger, Docs). Top-centre mode pill (Home / Save now / Every payment) on a
computer only. Top-right network chip. Sets `html[data-app-shell="on"]`; shelled containers
wear `.sp-page`. Below 720px the rail becomes a bottom bar of **five labelled tabs** (Home,
Save, Every payment, Receipts, More; More opens the rest as a sheet), the mode pill is gone,
and pages take `padding-bottom: 92px`. `/pay`, `/receipt`, `/claim`,
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
