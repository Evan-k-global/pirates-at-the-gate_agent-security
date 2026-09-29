CREATE TABLE `witness_quotas` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `witness_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
