ALTER TABLE `episodes` ADD `existing_revision_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `episodes` ADD `existing_revision_real` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `episodes` ADD `existing_release_group` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `revision_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_files` ADD `revision_real` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_files` ADD `release_group` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `repack` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_revision_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_revision_real` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `existing_release_group` text;