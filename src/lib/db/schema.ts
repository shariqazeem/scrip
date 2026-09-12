import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * THE CACHE OF A CHAIN, NOT A LEDGER OF RECORD.
 *
 * Every row here mirrors something that exists on Solana: a Book PDA, a Receipt PDA, a token
 * balance, an issuer multiplier. The chain is the memory; this is the index that makes a page
 * fast. Nothing may be stored here that exists ONLY here — if a number cannot be re-derived
 * from chain state or a stored receipt, it does not belong in a column and it does not render.
 *
 * AMOUNT UNITS. Two kinds of integer live in this schema and they are never interchangeable:
 *
 *   *_base   — USD VALUE in 6-decimal base units (the USDC convention). $1.50 = 1_500_000.
 *   qty_*    — TOKEN quantity in that MINT's own base units. The mint's decimals come from
 *              the asset registry, never from a guess: reading an 8-decimal equity token as
 *              6-decimal USDC is a 100x error in a balance.
 *
 * Both are SQLite INTEGERs, i.e. JS numbers, i.e. exact only below 2^53. `assertSafeBase` in
 * src/lib/money.ts is the guard, and a test holds it. The headroom is large — 2^53 6dp base
 * units is $9 billion, and 2^53 8dp token units is 90 million tokens — but "large" is not
 * "checked", and this is money.
 *
 * MULTIPLIERS ARE DECIMAL STRINGS, never floats. An issuer publishes 1.00734291; storing that
 * as an IEEE double and multiplying a balance by it is how a cost basis drifts a cent a day
 * until a dividend reads as a gain. src/lib/money.ts does the arithmetic in integers.
 */

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`);

/**
 * A Book — one person's whole position. Mirrors the on-chain `Book` PDA, which holds the mix
 * policy and the lifetime counters. The assets themselves are NEVER here and never in the
 * program: they sit in the owner's own token accounts.
 *
 * The policy lives on the book and nowhere else. `docs/architecture.md` lists both a
 * `policy_json` column here and a separate `policies` table; two places that hold one value is
 * the defect shape this codebase is built to avoid, so there is one. Recorded under "Known
 * drift" in CLAUDE.md.
 */
export const books = sqliteTable(
  "books",
  {
    id: id(),
    /** base58 owner pubkey — the identity of a book. */
    owner: text("owner").notNull(),
    /** base58 address of the Book PDA. */
    pda: text("pda").notNull(),
    /** Target weights, validated by src/lib/policy — `{legs:[{mint,bps}],driftBps}`. */
    policyJson: text("policy_json").notNull(),
    openedAt: integer("opened_at").notNull(),
    lifetimeReceivedBase: integer("lifetime_received_base").notNull().default(0),
    lifetimeSentBase: integer("lifetime_sent_base").notNull().default(0),
    /**
     * A book is private by default and an individual book page is OPT-IN. Chain data is
     * public; a savings product should not be the surface that makes someone's net worth
     * searchable by name. Locked in docs/decisions.md.
     */
    published: integer("published").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("books_owner_uq").on(t.owner), uniqueIndex("books_pda_uq").on(t.pda)],
);

/**
 * One mint's position inside one book.
 *
 * `qty_raw` is what the chain reports. `qty_adjusted` is that quantity through the issuer's
 * current multiplier, and it is the ONLY quantity a screen may render. Storing raw and
 * computing returns from it is the bug this whole product is built around: a reinvested
 * dividend reads as a gain and a 4-for-1 split reads as a 300% return.
 */
export const positions = sqliteTable(
  "positions",
  {
    id: id(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    mint: text("mint").notNull(),
    qtyRaw: integer("qty_raw").notNull().default(0),
    qtyAdjusted: integer("qty_adjusted").notNull().default(0),
    /** USD value paid for this position, 6dp base units. Reconciled on every multiplier change. */
    costBasisBase: integer("cost_basis_base").notNull().default(0),
    /** The multiplier in force when this position was opened. Decimal string. */
    multiplierAtEntry: text("multiplier_at_entry").notNull().default("1"),
    updatedAt: integer("updated_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("positions_book_mint_uq").on(t.bookId, t.mint)],
);

/**
 * Every issuer multiplier we have ever seen, kept forever.
 *
 * xStocks publishes a mint-level multiplier before each ex-date and activates it at 00:30 UTC
 * the day after; Ondo does the equivalent through Scaled UI. Keeping the history — not just the
 * current value — is what makes a reconciliation auditable after the fact, and what lets a
 * position opened mid-cycle be valued correctly after a later split.
 *
 * `seen_at` is when WE observed it; `effective_at` is when the issuer activates it. They are
 * different questions and a watcher that conflates them will reconcile a day early.
 */
export const multipliers = sqliteTable(
  "multipliers",
  {
    id: id(),
    mint: text("mint").notNull(),
    /** Decimal string, exactly as published. Never a float. */
    value: text("value").notNull(),
    effectiveAt: integer("effective_at").notNull(),
    /** Which issuer endpoint this came from, so a wrong number is traceable to its source. */
    source: text("source").notNull(),
    seenAt: integer("seen_at").notNull(),
    createdAt: createdAt(),
  },
  // The unique index on (mint, effective_at) is also the lookup index — "latest multiplier
  // for this mint" is a descending scan of its leading column. A second index on the same
  // pair would be one more list to drift.
  (t) => [uniqueIndex("multipliers_mint_effective_uq").on(t.mint, t.effectiveAt)],
);

/** A payout: escrowed by a payer, released to recipients under the RECIPIENTS' own policies. */
export const payouts = sqliteTable(
  "payouts",
  {
    id: id(),
    pda: text("pda").notNull(),
    payer: text("payer").notNull(),
    /** What was escrowed — `[{mint,amountBase}]`. */
    legsJson: text("legs_json").notNull(),
    /** Total USD value escrowed, 6dp. */
    valueBase: integer("value_base").notNull(),
    /**
     * Why this was paid — free text, asserted by the payer. Webgold settles; it does not judge.
     * Whether a reason was verified by a human, a model, or nobody at all is outside this system.
     */
    reason: text("reason").notNull(),
    /** Optional restriction on the ASSET SET only — never on weights. `{mints:[...]}` or null. */
    constraintJson: text("constraint_json"),
    fundedAt: integer("funded_at").notNull(),
    releasedAt: integer("released_at"),
    /** Set at release; every receipt and cohort row from this release carries it. */
    releaseId: text("release_id"),
    status: text("status").notNull().default("funded"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payouts_pda_uq").on(t.pda), index("payouts_payer_idx").on(t.payer)],
);

/**
 * The named arrival — the product itself.
 *
 * A receipt is a program account first and a row here second. A memory that lives only in our
 * database is one we can lose or be accused of inventing; one that lives on chain can be opened
 * by anyone, forever, and survives us.
 */
export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    /** base58 address of the on-chain Receipt PDA. */
    pda: text("pda").notNull(),
    /** The transaction signature this is anchored to — the public page's key. */
    sig: text("sig").notNull(),
    /** "payout" | "send" | "sponsor" | "reconciliation" */
    kind: text("kind").notNull(),
    payoutId: text("payout_id").references(() => payouts.id, { onDelete: "set null" }),
    payer: text("payer").notNull(),
    recipient: text("recipient").notNull(),
    /** Mint-by-mint amounts as they landed — `[{mint,amountBase,valueBase}]`. */
    legsJson: text("legs_json").notNull(),
    /** Value in 6dp USD at the Pyth stamp. */
    valueBase: integer("value_base").notNull(),
    /** Gram-equivalent at the same stamp, so the arrival reads in grams forever. */
    gramsAtStamp: text("grams_at_stamp").notNull(),
    reason: text("reason").notNull(),
    constraintJson: text("constraint_json"),
    releaseId: text("release_id"),
    at: integer("at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("receipts_sig_uq").on(t.sig),
    index("receipts_recipient_idx").on(t.recipient),
    index("receipts_release_idx").on(t.releaseId),
    index("receipts_at_idx").on(t.at),
  ],
);

/**
 * Keep-rate at thirty days, and the reason it cannot be faked.
 *
 * The snapshot is written AT RELEASE, in the same breath as the receipt. A cohort that was not
 * recorded cannot be reconstructed later — you would be measuring a balance against a number you
 * invented afterwards, which is exactly the farm this metric exists to distinguish from a payout.
 */
export const cohorts = sqliteTable(
  "cohorts",
  {
    id: id(),
    releaseId: text("release_id").notNull(),
    recipient: text("recipient").notNull(),
    /** USD value that landed, 6dp, stamped at release. Never rewritten. */
    valueAtReleaseBase: integer("value_at_release_base").notNull(),
    releasedAt: integer("released_at").notNull(),
    /** Filled by the measurement pass, not at release. */
    measuredAt: integer("measured_at"),
    valueNowBase: integer("value_now_base"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("cohorts_release_recipient_uq").on(t.releaseId, t.recipient),
    index("cohorts_released_idx").on(t.releasedAt),
  ],
);

/** A named send: a gift or a request settled. Carries the same receipt as a campaign payout. */
export const transfers = sqliteTable(
  "transfers",
  {
    id: id(),
    sig: text("sig").notNull(),
    fromBookId: text("from_book_id").references(() => books.id, { onDelete: "set null" }),
    toOwner: text("to_owner").notNull(),
    legsJson: text("legs_json").notNull(),
    valueBase: integer("value_base").notNull(),
    note: text("note"),
    at: integer("at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("transfers_sig_uq").on(t.sig)],
);

/**
 * A goal vault: skims a chosen share of every inbound payout toward something named.
 * It can spend in exactly two directions — back into the owner's book, or out to the owner —
 * and it has no discretion of any kind.
 */
export const goals = sqliteTable(
  "goals",
  {
    id: id(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    targetBase: integer("target_base").notNull(),
    skimBps: integer("skim_bps").notNull(),
    accumulatedBase: integer("accumulated_base").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("goals_book_slug_uq").on(t.bookId, t.slug)],
);

/** An issuer-funded first position, waiting for a book that does not exist yet. */
export const sponsorships = sqliteTable(
  "sponsorships",
  {
    id: id(),
    sponsor: text("sponsor").notNull(),
    mint: text("mint").notNull(),
    amountBase: integer("amount_base").notNull(),
    claimedBy: text("claimed_by"),
    claimedAt: integer("claimed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sponsorships_claimed_idx").on(t.claimedBy)],
);
