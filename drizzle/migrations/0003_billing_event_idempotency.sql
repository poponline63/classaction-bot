CREATE TABLE `billing_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`processor` text NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`external_customer_id_present` integer DEFAULT false NOT NULL,
	`external_subscription_id_present` integer DEFAULT false NOT NULL,
	`processed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_billing_event_id` ON `billing_events` (`event_id`);
--> statement-breakpoint
CREATE INDEX `idx_billing_event_user` ON `billing_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_billing_event_processed_at` ON `billing_events` (`processed_at`);
