CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`pda` text NOT NULL,
	`slug` text NOT NULL,
	`asset` text NOT NULL,
	`opened_unix` integer NOT NULL,
	`rule_enabled` integer DEFAULT 0 NOT NULL,
	`rate_bps` integer DEFAULT 0 NOT NULL,
	`escalate_bps` integer DEFAULT 0 NOT NULL,
	`floor_usdc` integer DEFAULT 0 NOT NULL,
	`cap_usdc` integer DEFAULT 0 NOT NULL,
	`tolerance_bps` integer DEFAULT 0 NOT NULL,
	`watermark_usdc` integer DEFAULT 0 NOT NULL,
	`enabled_unix` integer DEFAULT 0 NOT NULL,
	`sweeps` integer DEFAULT 0 NOT NULL,
	`float_lamports` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_owner_uq` ON `books` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `books_pda_uq` ON `books` (`pda`);--> statement-breakpoint
CREATE UNIQUE INDEX `books_slug_uq` ON `books` (`slug`);--> statement-breakpoint
CREATE TABLE `cursors` (
	`key` text PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`slot` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intakes` (
	`release_id` text PRIMARY KEY NOT NULL,
	`payer` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`pda` text NOT NULL,
	`sig` text NOT NULL,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`payer` text DEFAULT '' NOT NULL,
	`submitter` text NOT NULL,
	`book` text NOT NULL,
	`release_id` text NOT NULL,
	`reason_hash` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`basis_usdc` integer NOT NULL,
	`rate_bps` integer NOT NULL,
	`paid_usdc` integer NOT NULL,
	`asset` text NOT NULL,
	`amount_raw` integer NOT NULL,
	`price_feed` text DEFAULT '' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`price_expo` integer DEFAULT 0 NOT NULL,
	`price_conf` integer DEFAULT 0 NOT NULL,
	`price_publish_time` integer DEFAULT 0 NOT NULL,
	`settled_slot` integer NOT NULL,
	`settled_unix` integer NOT NULL,
	`measured_7d_at` integer DEFAULT 0 NOT NULL,
	`measured_7d_raw` integer DEFAULT 0 NOT NULL,
	`measured_30d_at` integer DEFAULT 0 NOT NULL,
	`measured_30d_raw` integer DEFAULT 0 NOT NULL,
	`attributed_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_pda_uq` ON `receipts` (`pda`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_sig_uq` ON `receipts` (`sig`);--> statement-breakpoint
CREATE INDEX `receipts_recipient_idx` ON `receipts` (`recipient`);--> statement-breakpoint
CREATE INDEX `receipts_settled_idx` ON `receipts` (`settled_unix`);