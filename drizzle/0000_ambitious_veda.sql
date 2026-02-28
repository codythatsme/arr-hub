CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_token_hash_unique` ON `api_keys` (`token_hash`);--> statement-breakpoint
CREATE TABLE `custom_format_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`custom_format_id` integer NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`custom_format_id`) REFERENCES `custom_formats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_format_scores_profile_id_custom_format_id_unique` ON `custom_format_scores` (`profile_id`,`custom_format_id`);--> statement-breakpoint
CREATE TABLE `custom_format_specs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`custom_format_id` integer NOT NULL,
	`name` text NOT NULL,
	`field` text NOT NULL,
	`pattern` text NOT NULL,
	`negate` integer DEFAULT false NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`custom_format_id`) REFERENCES `custom_formats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`include_when_renaming` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_formats_name_unique` ON `custom_formats` (`name`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`overview` text,
	`poster_path` text,
	`status` text DEFAULT 'wanted' NOT NULL,
	`quality_profile_id` integer,
	`root_folder_path` text,
	`monitored` integer DEFAULT true NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `quality_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`quality_name` text,
	`group_name` text,
	`weight` integer NOT NULL,
	`allowed` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`upgrade_allowed` integer DEFAULT false NOT NULL,
	`min_format_score` integer DEFAULT 0 NOT NULL,
	`cutoff_format_score` integer DEFAULT 0 NOT NULL,
	`min_upgrade_format_score` integer DEFAULT 1 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`applied_bundle_id` text,
	`applied_bundle_version` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quality_profiles_name_unique` ON `quality_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);