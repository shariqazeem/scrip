CREATE TABLE `invites` (
	`address` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`added_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
