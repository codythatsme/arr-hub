ALTER TABLE `indexer_stats` ADD `total_grabs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexer_stats` ADD `last_grab_at` integer;--> statement-breakpoint
ALTER TABLE `indexer_stats` ADD `grab_limit_window_started_at` integer;--> statement-breakpoint
ALTER TABLE `indexer_stats` ADD `grab_limit_window_grabs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `grab_limit_count` integer;--> statement-breakpoint
ALTER TABLE `indexers` ADD `grab_limit_window_seconds` integer;