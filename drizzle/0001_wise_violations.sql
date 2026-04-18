CREATE TABLE `download_client_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_client_id` integer NOT NULL,
	`last_check` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`error_message` text,
	`response_time_ms` integer,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_client_health_download_client_id_unique` ON `download_client_health` (`download_client_id`);--> statement-breakpoint
CREATE TABLE `download_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text NOT NULL,
	`password_encrypted` text NOT NULL,
	`use_ssl` integer DEFAULT false NOT NULL,
	`category` text,
	`priority` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{"pollIntervalMs":5000}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_client_id` integer NOT NULL,
	`movie_id` integer,
	`series_id` integer,
	`episode_ids` text,
	`external_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`title` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`eta_seconds` integer,
	`error_message` text,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_queue_external_id_unique` ON `download_queue` (`external_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`tvdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`episode_number` integer NOT NULL,
	`air_date` integer,
	`overview` text,
	`has_file` integer DEFAULT false NOT NULL,
	`file_path` text,
	`monitored` integer DEFAULT true NOT NULL,
	`existing_quality_name` text,
	`existing_quality_rank` integer,
	`existing_format_score` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tvdb_id_unique` ON `episodes` (`tvdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_id_episode_number_unique` ON `episodes` (`season_id`,`episode_number`);--> statement-breakpoint
CREATE TABLE `indexer_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`indexer_id` integer NOT NULL,
	`last_check` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`error_message` text,
	`response_time_ms` integer,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_health_indexer_id_unique` ON `indexer_health` (`indexer_id`);--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`capabilities` text DEFAULT 'null',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_server_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_server_id` integer NOT NULL,
	`last_check` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`error_message` text,
	`response_time_ms` integer,
	FOREIGN KEY (`media_server_id`) REFERENCES `media_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_server_health_media_server_id_unique` ON `media_server_health` (`media_server_id`);--> statement-breakpoint
CREATE TABLE `media_server_libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_server_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_synced` integer,
	FOREIGN KEY (`media_server_id`) REFERENCES `media_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_server_libraries_media_server_id_external_id_unique` ON `media_server_libraries` (`media_server_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `media_servers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`token_encrypted` text NOT NULL,
	`use_ssl` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{"syncIntervalMs":3600000}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `release_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`candidate_title` text NOT NULL,
	`indexer_id` integer,
	`indexer_name` text,
	`quality_rank` integer,
	`format_score` integer DEFAULT 0 NOT NULL,
	`decision` text NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`decided_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `root_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`free_space_bytes` integer,
	`total_space_bytes` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `root_folders_path_unique` ON `root_folders` (`path`);--> statement-breakpoint
CREATE TABLE `scheduler_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_type` text NOT NULL,
	`interval_minutes` integer NOT NULL,
	`retry_delay_seconds` integer DEFAULT 60 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`backoff_multiplier` real DEFAULT 2 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduler_config_job_type_unique` ON `scheduler_config` (`job_type`);--> statement-breakpoint
CREATE TABLE `scheduler_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_run_at` integer DEFAULT (unixepoch()) NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_series_id_season_number_unique` ON `seasons` (`series_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tvdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`overview` text,
	`poster_path` text,
	`status` text DEFAULT 'wanted' NOT NULL,
	`network` text,
	`root_folder_path` text,
	`monitored` integer DEFAULT true NOT NULL,
	`quality_profile_id` integer,
	`season_folder` integer DEFAULT true NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_tvdb_id_unique` ON `series` (`tvdb_id`);--> statement-breakpoint
ALTER TABLE `movies` ADD `has_file` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `file_path` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_quality_name` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_quality_rank` integer;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_format_score` integer;