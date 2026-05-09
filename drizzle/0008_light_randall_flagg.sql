ALTER TABLE `movies` ADD `imdb_id` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `original_title` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `release_date` integer;--> statement-breakpoint
ALTER TABLE `movies` ADD `genres` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `runtime_minutes` integer;--> statement-breakpoint
ALTER TABLE `movies` ADD `metadata_refreshed_at` integer;