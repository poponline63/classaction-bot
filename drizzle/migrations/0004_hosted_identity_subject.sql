ALTER TABLE `users` ADD `external_subject` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_users_external_subject` ON `users` (`external_subject`);
