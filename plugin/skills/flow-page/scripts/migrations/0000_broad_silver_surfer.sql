CREATE TABLE `aliases` (
	`flow` text NOT NULL,
	`alias` text NOT NULL,
	`lookup` text NOT NULL,
	PRIMARY KEY(`flow`, `alias`)
);
--> statement-breakpoint
CREATE INDEX `aliases_lookup` ON `aliases` (`lookup`);--> statement-breakpoint
CREATE TABLE `bindings` (
	`session` text NOT NULL,
	`agent` text NOT NULL,
	`flow` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`session`, `agent`)
);
--> statement-breakpoint
CREATE INDEX `bindings_flow` ON `bindings` (`flow`);--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`folder` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`created` text NOT NULL,
	`closed` text
);
--> statement-breakpoint
CREATE INDEX `flows_closed` ON `flows` (`closed`);--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_progress` (
	`flow` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `migration_identities` (
	`source` text PRIMARY KEY NOT NULL,
	`flow` text NOT NULL,
	`sha256` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_contexts` (
	`flow` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reader_comments` (
	`flow` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
