CREATE TABLE `release_blocklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`candidate_title` text NOT NULL,
	`indexer_id` integer,
	`indexer_name` text,
	`download_url` text,
	`infohash` text,
	`external_id` text,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_blocklist_media_id_media_type_candidate_title_unique` ON `release_blocklist` (`media_id`,`media_type`,`candidate_title`);