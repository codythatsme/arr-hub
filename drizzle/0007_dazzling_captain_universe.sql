ALTER TABLE `episodes` ADD `tmdb_id` integer;--> statement-breakpoint
ALTER TABLE `episodes` ADD `absolute_episode_number` integer;--> statement-breakpoint
ALTER TABLE `episodes` ADD `runtime_minutes` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tmdb_id_unique` ON `episodes` (`tmdb_id`);--> statement-breakpoint
ALTER TABLE `seasons` ADD `tmdb_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_tmdb_id_unique` ON `seasons` (`tmdb_id`);--> statement-breakpoint
ALTER TABLE `series` ADD `tmdb_id` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `imdb_id` text;--> statement-breakpoint
ALTER TABLE `series` ADD `original_title` text;--> statement-breakpoint
ALTER TABLE `series` ADD `genres` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `runtime_minutes` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `series_type` text;--> statement-breakpoint
ALTER TABLE `series` ADD `certification` text;--> statement-breakpoint
ALTER TABLE `series` ADD `metadata_refreshed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `series_tmdb_id_unique` ON `series` (`tmdb_id`);