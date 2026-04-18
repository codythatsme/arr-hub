CREATE TABLE `plex_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_server_id` integer NOT NULL,
	`plex_user_id` text NOT NULL,
	`username` text NOT NULL,
	`friendly_name` text NOT NULL,
	`email` text,
	`thumb` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` integer,
	`total_play_count` integer DEFAULT 0 NOT NULL,
	`total_watch_time_sec` integer DEFAULT 0 NOT NULL,
	`synced_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_server_id`) REFERENCES `media_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plex_users_media_server_id_plex_user_id_unique` ON `plex_users` (`media_server_id`,`plex_user_id`);