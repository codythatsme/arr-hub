CREATE TABLE `plugins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`version` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`capabilities` text NOT NULL,
	`loaded_at` integer,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_name_unique` ON `plugins` (`name`);