CREATE TABLE `domain_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`media_kind` text,
	`movie_id` integer,
	`series_id` integer,
	`season_id` integer,
	`episode_id` integer,
	`release_decision_id` integer,
	`release_title` text,
	`indexer_id` integer,
	`indexer_name` text,
	`download_client_id` integer,
	`download_client_name` text,
	`download_external_id` text,
	`scheduler_job_id` integer,
	`notification_delivery_id` integer,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`context` text DEFAULT 'null'
);
