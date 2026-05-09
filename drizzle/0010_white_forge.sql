CREATE TABLE `media_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_kind` text NOT NULL,
	`media_id` integer NOT NULL,
	`path` text NOT NULL,
	`source_path` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`quality_name` text,
	`quality_rank` integer,
	`format_score` integer DEFAULT 0 NOT NULL,
	`imported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_path_unique` ON `media_files` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_media_kind_media_id_unique` ON `media_files` (`media_kind`,`media_id`);--> statement-breakpoint
CREATE TABLE `remote_path_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_client_id` integer,
	`remote_path` text NOT NULL,
	`local_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_path_mappings_download_client_id_remote_path_unique` ON `remote_path_mappings` (`download_client_id`,`remote_path`);