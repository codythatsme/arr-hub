CREATE TABLE `recent_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`indexer_id` integer NOT NULL,
	`release_key` text NOT NULL,
	`title` text NOT NULL,
	`indexer_name` text NOT NULL,
	`indexer_priority` integer NOT NULL,
	`size` integer NOT NULL,
	`seeders` integer,
	`leechers` integer,
	`age` integer NOT NULL,
	`download_url` text NOT NULL,
	`info_url` text,
	`category` text NOT NULL,
	`protocol` text NOT NULL,
	`published_at` integer NOT NULL,
	`infohash` text,
	`download_factor` real DEFAULT 1 NOT NULL,
	`upload_factor` real DEFAULT 1 NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recent_releases_indexer_id_release_key_unique` ON `recent_releases` (`indexer_id`,`release_key`);