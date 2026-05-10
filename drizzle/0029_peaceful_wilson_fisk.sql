CREATE TABLE `delay_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enable_usenet` integer DEFAULT true NOT NULL,
	`enable_torrent` integer DEFAULT true NOT NULL,
	`preferred_protocol` text DEFAULT 'either' NOT NULL,
	`usenet_delay_minutes` integer DEFAULT 0 NOT NULL,
	`torrent_delay_minutes` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`bypass_if_highest_quality` integer DEFAULT false NOT NULL,
	`bypass_if_above_custom_format_score` integer DEFAULT false NOT NULL,
	`minimum_custom_format_score` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delay_profiles_name_unique` ON `delay_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `import_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'custom' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`enable_auto` integer DEFAULT false NOT NULL,
	`quality_profile_id` integer,
	`root_folder_path` text,
	`search_on_add` integer DEFAULT false NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_lists_name_unique` ON `import_lists` (`name`);--> statement-breakpoint
CREATE TABLE `release_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`required_terms` text DEFAULT '[]' NOT NULL,
	`ignored_terms` text DEFAULT '[]' NOT NULL,
	`preferred_terms` text DEFAULT '[]' NOT NULL,
	`indexer_ids` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`excluded_tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_profiles_name_unique` ON `release_profiles` (`name`);