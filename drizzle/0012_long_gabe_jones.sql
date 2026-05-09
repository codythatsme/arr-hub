CREATE TABLE `indexer_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_key` text NOT NULL,
	`display_name` text NOT NULL,
	`protocol` text NOT NULL,
	`implementation` text NOT NULL,
	`base_url` text,
	`privacy` text DEFAULT 'private' NOT NULL,
	`supports_rss` integer DEFAULT true NOT NULL,
	`supports_search` integer DEFAULT true NOT NULL,
	`auth_fields` text DEFAULT '[]' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`capabilities` text DEFAULT '{"searchTypes":[],"categories":[]}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`version` text DEFAULT 'builtin-1' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_definitions_definition_key_unique` ON `indexer_definitions` (`definition_key`);--> statement-breakpoint
CREATE TABLE `indexer_proxies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer,
	`username` text,
	`password_encrypted` text,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `indexer_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`indexer_id` integer NOT NULL,
	`total_searches` integer DEFAULT 0 NOT NULL,
	`successful_searches` integer DEFAULT 0 NOT NULL,
	`failed_searches` integer DEFAULT 0 NOT NULL,
	`total_rss` integer DEFAULT 0 NOT NULL,
	`successful_rss` integer DEFAULT 0 NOT NULL,
	`failed_rss` integer DEFAULT 0 NOT NULL,
	`average_response_time_ms` integer,
	`last_search_at` integer,
	`last_rss_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_stats_indexer_id_unique` ON `indexer_stats` (`indexer_id`);--> statement-breakpoint
ALTER TABLE `indexers` ADD `definition_key` text;--> statement-breakpoint
ALTER TABLE `indexers` ADD `proxy_id` integer REFERENCES indexer_proxies(id);--> statement-breakpoint
ALTER TABLE `indexers` ADD `search_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `rss_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `tags` text DEFAULT '[]' NOT NULL;