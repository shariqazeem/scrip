CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`pda` text NOT NULL,
	`policy_json` text NOT NULL,
	`opened_at` integer NOT NULL,
	`lifetime_received_base` integer DEFAULT 0 NOT NULL,
	`lifetime_sent_base` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_owner_uq` ON `books` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `books_pda_uq` ON `books` (`pda`);--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`recipient` text NOT NULL,
	`value_at_release_base` integer NOT NULL,
	`released_at` integer NOT NULL,
	`measured_at` integer,
	`value_now_base` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cohorts_release_recipient_uq` ON `cohorts` (`release_id`,`recipient`);--> statement-breakpoint
CREATE INDEX `cohorts_released_idx` ON `cohorts` (`released_at`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`target_base` integer NOT NULL,
	`skim_bps` integer NOT NULL,
	`accumulated_base` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goals_book_slug_uq` ON `goals` (`book_id`,`slug`);--> statement-breakpoint
CREATE TABLE `multipliers` (
	`id` text PRIMARY KEY NOT NULL,
	`mint` text NOT NULL,
	`value` text NOT NULL,
	`effective_at` integer NOT NULL,
	`source` text NOT NULL,
	`seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `multipliers_mint_effective_uq` ON `multipliers` (`mint`,`effective_at`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`pda` text NOT NULL,
	`payer` text NOT NULL,
	`legs_json` text NOT NULL,
	`value_base` integer NOT NULL,
	`reason` text NOT NULL,
	`constraint_json` text,
	`funded_at` integer NOT NULL,
	`released_at` integer,
	`release_id` text,
	`status` text DEFAULT 'funded' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_pda_uq` ON `payouts` (`pda`);--> statement-breakpoint
CREATE INDEX `payouts_payer_idx` ON `payouts` (`payer`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`mint` text NOT NULL,
	`qty_raw` integer DEFAULT 0 NOT NULL,
	`qty_adjusted` integer DEFAULT 0 NOT NULL,
	`cost_basis_base` integer DEFAULT 0 NOT NULL,
	`multiplier_at_entry` text DEFAULT '1' NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_book_mint_uq` ON `positions` (`book_id`,`mint`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`pda` text NOT NULL,
	`sig` text NOT NULL,
	`kind` text NOT NULL,
	`payout_id` text,
	`payer` text NOT NULL,
	`recipient` text NOT NULL,
	`legs_json` text NOT NULL,
	`value_base` integer NOT NULL,
	`grams_at_stamp` text NOT NULL,
	`reason` text NOT NULL,
	`constraint_json` text,
	`release_id` text,
	`at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`payout_id`) REFERENCES `payouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_sig_uq` ON `receipts` (`sig`);--> statement-breakpoint
CREATE INDEX `receipts_recipient_idx` ON `receipts` (`recipient`);--> statement-breakpoint
CREATE INDEX `receipts_release_idx` ON `receipts` (`release_id`);--> statement-breakpoint
CREATE INDEX `receipts_at_idx` ON `receipts` (`at`);--> statement-breakpoint
CREATE TABLE `sponsorships` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsor` text NOT NULL,
	`mint` text NOT NULL,
	`amount_base` integer NOT NULL,
	`claimed_by` text,
	`claimed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sponsorships_claimed_idx` ON `sponsorships` (`claimed_by`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`sig` text NOT NULL,
	`from_book_id` text,
	`to_owner` text NOT NULL,
	`legs_json` text NOT NULL,
	`value_base` integer NOT NULL,
	`note` text,
	`at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`from_book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_sig_uq` ON `transfers` (`sig`);