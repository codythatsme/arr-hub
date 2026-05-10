CREATE TABLE `auto_tagging_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`media_type` text DEFAULT 'both' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`specifications` text DEFAULT '[]' NOT NULL,
	`remove_tags_automatically` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auto_tagging_rules_name_unique` ON `auto_tagging_rules` (`name`);--> statement-breakpoint
CREATE TABLE `custom_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_filters_type_label_unique` ON `custom_filters` (`type`,`label`);