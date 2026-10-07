CREATE TABLE `saves` (
	`sig` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mint` text NOT NULL,
	`paid_usdc` integer NOT NULL,
	`amount_raw` integer NOT NULL,
	`settled_slot` integer NOT NULL,
	`settled_unix` integer NOT NULL,
	`route_json` text DEFAULT '[]' NOT NULL,
	`fee_lamports` integer DEFAULT 0 NOT NULL,
	`price_feed` text DEFAULT '' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`price_expo` integer DEFAULT 0 NOT NULL,
	`price_conf` integer DEFAULT 0 NOT NULL,
	`price_publish_time` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saves_owner_idx` ON `saves` (`owner`);--> statement-breakpoint
CREATE INDEX `saves_settled_idx` ON `saves` (`settled_unix`);