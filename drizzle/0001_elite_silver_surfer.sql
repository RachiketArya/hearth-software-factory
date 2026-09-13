CREATE TABLE `hearth_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_by` text,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hearth_invites_token_hash_unique` ON `hearth_invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `hearth_members` (
	`workspace` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `hearth_members_user` ON `hearth_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `hearth_presence` (
	`workspace` text NOT NULL,
	`user_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `hearth_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
