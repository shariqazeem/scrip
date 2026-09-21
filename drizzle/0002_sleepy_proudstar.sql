CREATE TABLE `telegram_links` (
	`owner` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`chat_id` text DEFAULT '' NOT NULL,
	`linked_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
