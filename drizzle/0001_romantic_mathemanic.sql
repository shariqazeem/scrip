CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`pda` text NOT NULL,
	`payer` text NOT NULL,
	`recipient` text NOT NULL,
	`asset` text NOT NULL,
	`grant_id` text NOT NULL,
	`total_raw` integer DEFAULT 0 NOT NULL,
	`released_raw` integer DEFAULT 0 NOT NULL,
	`release_cap_raw` integer,
	`start_unix` integer NOT NULL,
	`cliff_secs` integer NOT NULL,
	`duration_secs` integer NOT NULL,
	`revocable` integer DEFAULT 0 NOT NULL,
	`sealed` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`declared_usdc` integer DEFAULT 0 NOT NULL,
	`run_id` text DEFAULT '' NOT NULL,
	`created_unix` integer NOT NULL,
	`vests` integer DEFAULT 0 NOT NULL,
	`float_lamports` integer DEFAULT 0 NOT NULL,
	`seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_pda_uq` ON `grants` (`pda`);--> statement-breakpoint
CREATE INDEX `grants_payer_idx` ON `grants` (`payer`);--> statement-breakpoint
CREATE INDEX `grants_recipient_idx` ON `grants` (`recipient`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`payer` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`planned` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `books` ADD `kind` text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipts` ADD `run_id` text DEFAULT '' NOT NULL;