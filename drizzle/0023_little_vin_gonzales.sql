CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login_key` text NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` integer NOT NULL,
	`last_failed_at` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_attempts_login_key_unique` ON `login_attempts` (`login_key`);