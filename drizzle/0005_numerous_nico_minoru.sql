CREATE TABLE `plan_requests` (
	`plan` text NOT NULL,
	`address` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`plan`, `address`)
);
