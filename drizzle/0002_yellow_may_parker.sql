CREATE TABLE `session_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_server_id` integer NOT NULL,
	`plex_user_id` text NOT NULL,
	`plex_username` text NOT NULL,
	`rating_key` text NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`parent_title` text,
	`grandparent_title` text,
	`year` integer,
	`thumb` text,
	`started_at` integer NOT NULL,
	`stopped_at` integer NOT NULL,
	`duration` integer NOT NULL,
	`view_offset` integer NOT NULL,
	`paused_duration_sec` integer DEFAULT 0 NOT NULL,
	`transcode_decision` text NOT NULL,
	`video_resolution` text,
	`audio_codec` text,
	`player` text NOT NULL,
	`platform` text NOT NULL,
	`product` text,
	`ip_address` text,
	`bandwidth` integer,
	`is_local` integer NOT NULL,
	`movie_id` integer,
	`episode_id` integer,
	FOREIGN KEY (`media_server_id`) REFERENCES `media_servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_servers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`token_encrypted` text NOT NULL,
	`use_ssl` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{"syncIntervalMs":3600000,"monitoringEnabled":true}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_media_servers`("id", "name", "type", "host", "port", "token_encrypted", "use_ssl", "enabled", "settings", "created_at", "updated_at") SELECT "id", "name", "type", "host", "port", "token_encrypted", "use_ssl", "enabled", "settings", "created_at", "updated_at" FROM `media_servers`;--> statement-breakpoint
DROP TABLE `media_servers`;--> statement-breakpoint
ALTER TABLE `__new_media_servers` RENAME TO `media_servers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;