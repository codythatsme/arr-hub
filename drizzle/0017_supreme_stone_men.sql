ALTER TABLE `indexer_stats` ADD `query_limit_window_started_at` integer;--> statement-breakpoint
ALTER TABLE `indexer_stats` ADD `query_limit_window_searches` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `query_limit_count` integer;--> statement-breakpoint
ALTER TABLE `indexers` ADD `query_limit_window_seconds` integer;