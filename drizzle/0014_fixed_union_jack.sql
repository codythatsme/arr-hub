CREATE TABLE `indexer_definition_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_checked_at` integer,
	`last_error` text,
	`last_definition_key` text,
	`last_version` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_definition_sources_url_unique` ON `indexer_definition_sources` (`url`);--> statement-breakpoint
ALTER TABLE `indexer_definitions` ADD `source_yaml` text;