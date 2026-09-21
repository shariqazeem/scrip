# Scrip — from a product to a company

> Written 16 September 2026 after the state-of-the-product document. This is the plan for the
> second transformation: what Scrip becomes, why, what changes in the program, the app, the
> design and the operation, and in what order by leverage. It supersedes the design section,
> the presentation section and the roadmap of `PAIDIN.md`, and the options table in
> `docs/state.md`. Everything else in those documents stands.

---

## 0. Three pairs of eyes on what exists

**A judge.** Opens the front door and sees a film about a mechanism, with a stand-in book on
devnet. Opens the app and sees one person's rule and a column of stubs. Nothing on any
screen shows a second human being. Nothing moves that a second person caused. Verdict: a
well-made tool for one user. Not yet a thing people use.

**A user.** Sets 10%, signs once, and is done. Nothing ever calls them back: no message when
a stub prints, no statement, no milestone, no identity worth showing anyone. "The founder
does not feel it" is the product speaking, not the founder.

**A creative director.** The concept — paper, ink, the stub, the tape, the tear — is
distinctive and right for the subject. It is not the problem. The problem is that it dresses
a single-player screen. There is no *world*: no floor where things happen, no other actors,
no organisation side, no network visible, no object that a second person owns. Aesthetic
quality without a world reads as "well-built generic," which is the founder's own phrase.

**Diagnosis.** The design language is right. The scope, the aliveness and the number of
actors are wrong. The fix is not more polish on the same pages. It is a product with sides,
and real activity inside it.

---

## 1. The name: keep Scrip

A scrip is, historically, a certificate entitling the holder to shares, and "paid in scrip"
is the old phrase for being paid in something other than cash. There is no better word for a
company where income becomes stock certificates. *Paidin* says the behaviour; *Scrip* says
the object and the heritage, and it will still be right when the company is ten years old.
Do not rename again. Each rename spends brand memory and reads as doubt.

---

## 2. The idea, widened: get paid in ownership

The manifesto sentence, and the first thing on `/company`:

> Since the first stock exchange, being paid in ownership was for employees of public
> companies with brokerage accounts. Now a stock is a token that can be paid, ruled, given,
> vested and remembered like money. Scrip is where income becomes ownership.

The rule stays the core mechanism and the personal product. What widens is who Scrip
serves and what the stock can do:

- **People** set a rule on the address they are paid to. Income becomes ownership. A
  register records every arrival with a receipt.
- **Organisations** pay in stock — a slice or all of each payment, to one person or to a
  whole team in one run — and **grant stock that vests**, the way public companies retain
  their people, except the stock can be any listed company, the payer can be any
  organisation, and the recipient can be anyone, anywhere, with any wallet.
- **The network** — keepers who sweep and vest, the public ledger, keep-rate measured on
  chain — is visible on a floor that never closes.

This is not a payments app. Payment is the intake. Ownership with a rule, a memory and a
schedule is the product. Every feature demonstrates a property of a tokenized stock that a
brokerage share never had:

| # | The first | Where it is shown |
|---|---|---|
| 1 | A stock can be **paid** | Pay in stock; the rule |
| 2 | A stock can **obey a rule** on an address | The rule |
| 3 | A stock can **remember** why it arrived | The receipt with a reason |
| 4 | A stock can **vest** from anyone to anyone | Grants |
| 5 | A stock can **arrive at 3am on a Sunday** | The clock on the floor |
| 6 | A stock can be **given to an empty wallet** | Claim links |
| 7 | A stock can **prove it was kept** | Keep-rate on chain |

What it is still not: a trading terminal, a robo-advisor, a lender, a card, a social feed,
a launchpad, a brokerage. It gives no advice. It never decides amounts.

One principle changes its wording, because grants and unclaimed gifts hold stock for a
while: *Scrip holds an asset only in an escrow the payer created, that the recipient can
see, and that the payer cannot spend.* Say it that way, everywhere.

---

## 3. The company test

A judge decides "people would use this" from tells, not claims. Six tells, and every phase
in this plan serves at least one:

1. **Other people are visible.** Handles, organisations, keepers — not one address.
2. **Things happen without the visitor.** A live tape with real timestamps and real money.
3. **The product has sides.** A personal space, an organisation space, a network view.
4. **Trust surfaces exist.** Security, program ids, a verifiable build, keeper status,
   complete docs, a changelog.
5. **One object is executed perfectly** — the stub — and appears everywhere: on the floor,
   in the register, on the phone, in the share image, on paper.
6. **Every state is designed.** Empty, loading, paused, error, success, offline.

---

## 4. The product map

### Marketing — `scrip.app`

| Route | What it is |
|---|---|
| `/` | The Floor: live. The tape of real arrivals, sweeps and vests; the clock; keep-rate; the printer printing real stubs. |
| `/people` | The rule, for a person. The five-second worked example. Turn it on. |
| `/teams` | Pay in stock. One person or a whole run. The split. A public "pays in stock" page. |
| `/grants` | Stock that vests. RSUs for anyone, in any listed company. |
| `/keepers` | The network as the chain sees it; how to run one. |
| `/ledger` | Every receipt; keep-rate; method. |
| `/actions` | Corporate actions: dividend multipliers, effective times, what the register did about them. The engine you built, shown. |
| `/assets` | The registry with issuer powers per row. |
| `/company` | The manifesto; the seven firsts; who builds this. |
| `/security` | Program ids, upgrade authority, verifiable build hash, what a keeper can and cannot do, what the escrow can and cannot do, bug bounty. |
| `/bounties` | Scrip's own bounties, paid in stock. |
| `/docs`, `/changelog`, `/brand` | Complete. |

### App — the register (a person)

| Route | What it is |
|---|---|
| `/app` | The moment: rule line, the watching line, the story, the register of stubs. |
| `/app/rule` | Turn on, change, pause. |
| `/app/holdings` | Units first. Vesting grants alongside owned stock. Dividends explained per row. |
| `/app/receipts` | Every stub, filterable, exportable. |
| `/app/statements` | Monthly statements rendered as the stub; download; print. |
| `/app/settings` | Allowance, float, notifications (Telegram, email), public page, handle. |

### App — pay (an organisation)

| Route | What it is |
|---|---|
| `/app/org` | The organisation's home: people paid, stock delivered, grants vesting, last run. |
| `/app/org/pay` | Pay one: handle or address, amount, split, reason. |
| `/app/org/runs` | Pay many: paste or upload, review, sign, a run page with every receipt. |
| `/app/org/grants` | Create and manage grants: schedule, revocable, progress. |
| `/app/org/people` | Everyone this organisation has paid, with their public pages if opted in. |
| `/app/org/settings` | Name, mark, handle, the public page, exports. |

### Public

| Route | What it is |
|---|---|
| `/@handle` | A person's register (opt-in) or an organisation's page. |
| `/receipt/[sig]` | The stub, from the chain. |
| `/run/[id]` | A payroll run: who was paid, in what, the receipts. |
| `/grant/[id]` | A grant: schedule, vested so far, next vest, receipts. |
| `/claim/[payer]/[rid]` | A first share waiting. |

`/@handle` replaces `/book/[handle]`. "Book" becomes **Register** in the interface (a
shareholder register is the real word); it stays `Book` in code.

---

## 5. What changes in the program

The current fifteen instructions stay. Additions:

**Receipt kinds.** `Sweep | Pay | Gift | Vest`. Add `run_id: [u8; 16]` (zero when not part of
a run) so an organisation's run page is derivable from chain state.

**Handle kind.** `Person | Org` on the Handle account, set at open.

**Grant.**

```
Grant       PDA ["grant", payer, grant_id]
  payer, recipient  Pubkey
  asset             Pubkey
  total_raw         u64          // bought at creation, sits in the grant's escrow ATA
  released_raw      u64
  start_unix        i64
  cliff_secs        u32
  duration_secs     u32          // linear after the cliff; 0 = all at the cliff
  revocable         bool
  reason_hash       [u8; 32]
  state             Active | Completed | Revoked
  float             lamports on the account for vest receipts and tips
```

| Instruction | Signer | Enforces |
|---|---|---|
| `open_grant(grant_id, recipient, asset, schedule, revocable, reason_hash, min_out_raw)` | payer | creates the Grant and its escrow ATA (owner = Grant PDA); client puts Memo + Jupiter (USDC → asset, destination = escrow) + `seal_grant` in the same transaction |
| `seal_grant` | payer, same transaction | escrow `>= min_out_raw`; sets `total_raw`; writes a Receipt of kind `Pay` with `paid_usdc` and `amount_raw` = 0 released (the grant's own record); deposits float |
| `vest` | anyone | `releasable = total × clamp((now − start − cliff) / duration, 0, 1) − released`; `> 0`; moves releasable raw units escrow → recipient ATA; writes a Receipt of kind `Vest`; pays tip + rent from the grant's float; marks Completed when released == total |
| `revoke_grant` | payer | `revocable`; unvested back to the payer's ATA; vested stays; state Revoked |
| `close_grant` | payer | state Completed or Revoked; returns rent and float |

Vesting is computed on raw units, so dividends reinvested through the multiplier while the
stock sits in escrow go to whoever the units vest to. The sentence on the grant page: "While
it vests, dividends reinvest into it."

**Split pay.** Client composition, no new instruction: one transaction with a plain USDC
transfer for the cash part and the intake sandwich for the stock part, one signature.

**Runs.** No new account. A run is many intake transactions sharing a `run_id`, signed in
one wallet session with `signAllTransactions`, submitted in sequence, with a run page built
from the receipts.

**Roadmap, not now.** Mixes on the rule (per-asset owed amounts locked at the watermark);
standing payroll (an organisation approves a delegate and a keeper executes monthly runs —
the rule on outbound); the embedded-wallet door.

---

## 6. The organisation side — pay in stock

This is distribution turned into product. The rule is invisible to payers by design, so
growth cannot come from payers noticing it. Payers become users when paying in stock is
easier and better than paying in cash, and every payment they make recruits a recipient with
a receipt.

**Pay one.** Handle or address, amount, the split (all in stock, or a slice in stock with the
rest in USDC), a reason. The reason is on the receipt forever. The recipient needs nothing;
an address with no register gets a claim link.

**Pay many — a run.** Paste handles and amounts, or upload a CSV: `handle, amount, split,
reason`. Review: total USDC, total in stock, the live quote per line, any address without a
register flagged as "will receive a claim link." Sign once for the whole run. A run page —
`/run/<id>` — lists everyone and links every receipt. A run is a payslip for a team.

**Grants.** Recipient, asset, amount, cliff, duration, revocable, reason. The payer buys the
stock now; it vests on schedule; keepers vest it; the recipient sees it in their register
under "vesting" with the next vest date; the grant page shows the schedule as a ruled
timeline. A revoked grant returns only what has not vested. This is the retention instrument
public companies have, for anyone.

**The organisation's public page — `/@org`.** "Pays in stock since September 2026." People
paid, stock delivered, grants vesting, the last run, and a mark. Recipients appear by handle
only if their register is public; otherwise as a count. This page is what an organisation
shares to recruit.

**Exports.** CSV of every payment and grant with signatures, for whoever does their books.

---

## 7. The person side — the register, and why anyone comes back

A set-and-forget product is felt at four moments. Build all four.

1. **The arrival.** A message when a stub prints: Telegram first (a bot; `/start` links a
   handle), email second. "$200 landed. $20 became 0.0262 SPYx." Tapping opens the receipt.
2. **The milestone.** First receipt. First whole share. Ten receipts. Thirty days kept.
   $1,000 in stock. Each is a share card (an OG image of the stub with the milestone line),
   understated, no confetti.
3. **The statement.** Monthly, rendered as the stub: what landed, what became stock, at
   what prices, what is held, keep-rate. Downloadable, printable. A print stylesheet on
   `/receipt/[sig]` too: a receipt you can hold.
4. **The identity.** The public register at `/@handle`: a proof of saving people post. The
   share card shows units and the staircase, never dollars unless the owner chooses.

Two lines of honest arithmetic that make the future visible without projecting: "at your
average arrival, your next whole share is about N arrivals away" and the staircase of
cumulative units. Both labelled arithmetic.

---

## 8. The Floor — the network

`/` is the floor, live, and it is the same view at `/floor` from inside the app.

- **The tape.** Every sweep, payment, gift and vest across the network as it happens, from
  the indexer over server-sent events: handle or truncated address, what became what, when.
  Real timestamps. On mainnet, real money. The tape is the proof that things happen without
  the visitor.
- **The clock.** "NYSE: closed — opens in 41 h. Scrip: open." Under it, a counter from the
  receipts: arrivals while Wall Street slept, as a share of all arrivals. This is first #5
  shown with data.
- **Keep-rate** at 7 and 30 days, with the method one link away.
- **Keepers.** Who is running, who swept what, health, the race. How to run one.
- **Corporate actions.** The next dividend multiplier per asset, its effective time, and
  what registers did about it: nothing, because it is automatic. Your engine, on stage.
- **The market.** The registry with price, liquidity, holders from Jupiter and Pyth, display
  only, labelled as such.

---

## 9. Design: "There is no opening bell"

### Art direction

The world of the old exchange floor, reborn without hours. Its objects map onto Scrip's
without strain: the **tape** is the live feed; the **register** is the personal record; the
**stub** is the receipt; the **floor** is the network; the **keepers** are the runners. Two
materials, assigned by surface:

- **The floor** — ink-dark, dense, alive. The marketing front, the ledger, the keepers page,
  the tape. Paper-coloured text and figures on ink; one accent; no glow, no neon, no
  gradients.
- **The register** — paper, calm, permanent. The app, the organisation space, every receipt
  and statement. White stubs on paper, ruled rows, the perforated edge.

The tear between them on the landing page already exists; now it is the transition between
the network and the personal everywhere. Dark is not a "mode." It is where the crowd is.

### Brand

- **Wordmark.** *Scrip*, set in Fraunces at a heavy optical size, tight — the engraver's
  serif of a certificate. Fraunces appears in exactly two places: the wordmark and the
  title line of a stub or statement. Nowhere else.
- **Mark.** A stub glyph: a rectangle with a perforated top edge and one ruled line. It is
  the favicon, the app icon, the Telegram bot's avatar, the keeper's health dot.
- **Voice.** Declarative, short, no exclamation marks, no "unlock," no "seamless." The
  manifesto sentence sets the register.

### Type and palette (unchanged in principle)

Instrument Sans for words; IBM Plex Mono, tabular, for every figure; units the largest thing
on any page. Paper `#f7f5ef`, ink `#14161c`, document blue `#2b4acb`; green and red for
money outcomes only, including price ticks on the tape; gold only on the GOLD chip. On the
floor the roles invert: ink is the ground, paper is the text, the accent is the same blue.

### The object system

One object, five sizes, everywhere:

| Size | Where |
|---|---|
| Stub, full | `/receipt/[sig]`, statements, print |
| Stub, card | the register, run pages, grant pages |
| Stub, line | the tape, `/app/receipts`, the ledger wall |
| Stub, ghost | dashed: money landed, not yet swept; a grant not yet vested |
| Stub, share | the OG image: receipt, register, milestone, run, organisation |

Nothing else on the site is allowed to look like a card. If something is not a stub it is a
ruled row or a paragraph.

### Motion

Spent only on real objects and real figures entering: a stub prints when a sweep lands; a
figure ticks when the chain changes it; the tape advances when a receipt exists. Text never
fades up on its own. Hover changes colour, not position. Reduced motion collapses all of it.

### Craft, per page, before it is done

- Loading is a skeleton in the real layout. Empty states say what will fill them and never
  fabricate a row. Error states say what happened and what to do. Paused states name the
  cause (revoked, delegate replaced, allowance out, float empty, feed stale, no keeper).
- Success is the object appearing, not a green banner.
- Cmd-K: jump to a handle, a receipt by signature, a run, a grant.
- Toasts for transaction states: building, signing, confirming, settled, failed — the same
  words as the buttons.
- Every public page has an OG image of the stub. Every stub prints on paper.
- PWA: manifest, install prompt, works offline for the register you last saw.
- 375 px first; the floor at 375 is the tape and the clock, nothing else above the fold.
- Keyboard focus visible; AA contrast on both materials.

### What generic looks like, so it is never shipped

A hero with a single accent-coloured word; all-caps eyebrows; a grid of identical cards with
the same shadow; a "features" row of three icons; stock illustrations; a testimonial slider
with invented names; dashboards of KPI tiles with sparklines that mean nothing; a dark theme
with purple glow. None of it belongs here.

---

## 10. Aliveness: the operating plan

Design builds the container. Only real activity fills it. This is not optional and it is not
the last step; it starts the day the program is on mainnet.

- **The founder is user zero.** The rule goes on the wallet the founder is actually paid to
  — prizes, gigs, bounties. `@shariq` is public. The first stubs on the floor are the
  founder's real income.
- **Scrip pays in stock.** `/bounties` lists real micro-tasks — run a keeper for a week,
  translate a docs page, break the claim flow, record thirty seconds on why you turned the
  rule on, design a stub variant — paid $5–$50 in SPYx through Scrip's own organisation
  page, `@scrip`. Fifty to a hundred real recipients over the judging window. Each one is a
  register, a receipt on the floor, and a data point in keep-rate. Budget: low four figures.
- **One partner organisation** pays one bounty round or one contractor month in stock: a
  Superteam chapter, a DAO, a friend's studio. Their `/@org` page is the second organisation
  on the floor, and the sentence "an organisation that is not us pays in stock through Scrip"
  is true.
- **First-share gifts.** A hundred claim links, $2–$5 each, to people who will open them.
  Empty wallets become registers.
- **Two keepers** from day one; a third run by someone who is not the founder.
- **Nothing seeded is hidden.** Every payment from Scrip is on `@scrip`'s page, labelled as
  Scrip's own. Real money, real people, openly ours.

---

## 11. What a judge experiences, with a phone

1. Opens `scrip.app`. The floor is live: a stub printed forty seconds ago for `@amina`, the
   clock says NYSE is closed, keep-rate at 7 days is a number.
2. Scans the QR, sends $5 USDC to the front wallet from their own phone. Watches the ghost
   stub become a stub on the same screen. Opens the receipt with no session.
3. Opens `/@scrip`: an organisation that has paid 61 people in stock, 3 grants vesting,
   last run yesterday. Opens a run page: 12 people, 12 receipts, reasons on each.
4. Opens a grant page: 1.00 NVDAx vesting over 180 days, 0.31 vested, next vest Friday.
5. Opens `/@amina`: a public register with a staircase and a 30-day keep-rate.
6. Opens `/keepers`: three keepers, two not run by the founder, racing.
7. Opens `/security`: the program id, the verifiable build hash, the multisig, what a keeper
   cannot do, what the escrow cannot do.
8. Reads `/company`: the seven firsts, each linked to where it happened on the floor today.

They never needed the founder in the room.

---

## 12. Order, by leverage

Phases, not dates. Each phase is shippable on its own and serves at least one tell from §3.

**Phase 1 — Real.** Mainnet program; paid RPC; Pyth key; two keepers; the founder's rule on
the founder's real wallet; the first ten real registers through bounties; the tape live on
the floor with real money. Nothing after this matters without it.

**Phase 2 — The company shell.** The marketing map (§4) with real screens in situ; the
wordmark and mark; the floor materials; OG images everywhere; the craft pass (states,
Cmd-K, toasts, print, PWA); `/security`, `/company`, `/changelog`, `/bounties`; Telegram
notifications. This is where "well-built generic" ends.

**Phase 3 — Teams.** Organisation handles; `@scrip`'s page; pay one with a split; runs;
`/run/[id]`; exports. Scrip's own bounties move onto it.

**Phase 4 — Grants.** The program addition (§5), the org UI, `/grant/[id]`, vesting in the
register, keepers vesting. The first grants are Scrip's own retention grants to the people
running keepers.

**Phase 5 — Return.** Statements; milestones and share cards; the public register polished
as a proof of saving; the arithmetic lines.

**Phase 6 — The film and the submission.** Two minutes, phone in frame, mainnet: the
silent-address demo, then a run paying twelve people, then a grant vesting, then the floor.
README leads with the manifesto and the seven firsts, each with a mainnet signature.

What must be true at submission regardless of how far the phases get: Phase 1 complete, the
floor live with people who are not the founder, the film. Everything else is what makes the
Foundation want to show it to the world; Phase 1 is what makes it true.

---

## 13. Do not

- Do not mention a token anywhere in the submission or the site. Foundation and Colosseum
  judges read token-first as a warning. The natural place for one later is the keeper
  network; that is a conversation after funding, not before.
- Do not add a social feed, following, likes, or comments. The tape is not social; it is a
  record.
- Do not build lending, a terminal, a launchpad, or agents. Kamino, Jupiter, Meteora and a
  thousand hackathon entries have those.
- Do not project returns, yields, or dividend income anywhere. Arithmetic on the past,
  labelled, is the limit.
- Do not rename.
- Do not let the film explain. Every scene shows a stub printing for a real person.

---

## 14. Risks

- **Escrow.** Grants and unclaimed gifts hold stock across time. The honest sentence in §2
  is the answer; the program enforces it; `/security` shows it.
- **Scope.** Six phases is a company's quarter. The order is the protection: each phase is
  whole on its own, and Phase 1 plus the film is a winning submission by itself.
- **Seeded activity.** Scrip paying its own bounties is real money to real people and is
  labelled as Scrip's; it is not fake traction. A judge who sees `@scrip` as the only
  organisation will ask for a second; §10 answers with a partner.
- **Legal shape.** Grants of securities-backed tokens on a schedule, executed by third-party
  keepers, non-custodial in design. The words keep Scrip out of custody and discretion;
  nobody has reviewed it; say so on `/security`.
- **Liveness.** Three keepers, one not the founder's, and a status line on the floor.
- **The founder's own conviction.** The plan's first act is the founder's rule on the
  founder's real income. If the first stub does not feel like something, stop and say so
  before building Phase 2.
