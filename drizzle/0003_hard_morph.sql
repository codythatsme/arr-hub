CREATE TABLE `setup_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`step_name` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`message` text,
	`reversible` integer DEFAULT false NOT NULL,
	`rolled_back` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setup_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text,
	`current_step` text,
	`completed_steps` text DEFAULT '[]' NOT NULL,
	`capabilities` text DEFAULT '{"movies":true,"tv":true}' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer
);
