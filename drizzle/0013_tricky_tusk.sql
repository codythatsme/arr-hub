CREATE TABLE `indexer_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`sync_base_url` text NOT NULL,
	`sync_api_key_encrypted` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{"syncCategories":[],"syncLevel":"full"}' NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `indexer_application_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`protocol` text NOT NULL,
	`remote_indexer_id` integer NOT NULL,
	`remote_indexer_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `indexer_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_application_mappings_application_id_protocol_unique` ON `indexer_application_mappings` (`application_id`,`protocol`);
