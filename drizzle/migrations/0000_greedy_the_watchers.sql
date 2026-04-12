CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`payload_json` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_audit_user` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_type` ON `audit_log` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_audit_time` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`settlement_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`class_authorization_id` integer NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`submitted_form_data_json` text,
	`submitted_attestation_text` text,
	`confirmation_id` text,
	`screenshot_empty_form_path` text,
	`screenshot_filled_form_path` text,
	`screenshot_confirmation_path` text,
	`pdf_receipt_path` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`queued_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`filed_at` integer,
	`paid_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`class_authorization_id`) REFERENCES `class_authorizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_claim_match` ON `claims` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_status` ON `claims` (`status`);--> statement-breakpoint
CREATE INDEX `idx_claim_user` ON `claims` (`user_id`);--> statement-breakpoint
CREATE TABLE `class_authorizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`category` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`authorized_at` integer,
	`revoked_at` integer,
	`attestation_text` text NOT NULL,
	`attestation_version` integer DEFAULT 1 NOT NULL,
	`scope_constraints_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_auth_user_category` ON `class_authorizations` (`user_id`,`category`);--> statement-breakpoint
CREATE TABLE `data_breach_exposure` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`breach_name` text NOT NULL,
	`breach_date` integer,
	`email` text NOT NULL,
	`source` text NOT NULL,
	`data_classes_json` text DEFAULT '[]',
	`hibp_breach_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_breach_user_name_email` ON `data_breach_exposure` (`user_id`,`breach_name`,`email`);--> statement-breakpoint
CREATE TABLE `form_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`administrator` text NOT NULL,
	`signature_hash` text NOT NULL,
	`schema_json` text NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_template_admin_sig` ON `form_templates` (`administrator`,`signature_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`payload_json` text,
	`run_after` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`locked_by` text,
	`locked_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_pick` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `idx_jobs_type` ON `jobs` (`type`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`settlement_id` integer NOT NULL,
	`verdict` text NOT NULL,
	`confidence` real NOT NULL,
	`reasoning_json` text NOT NULL,
	`matched_fields_json` text,
	`required_category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_match_user_settlement` ON `matches` (`user_id`,`settlement_id`);--> statement-breakpoint
CREATE INDEX `idx_match_verdict` ON `matches` (`verdict`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`legal_name` text,
	`date_of_birth` integer,
	`addresses_json` text DEFAULT '[]',
	`emails_json` text DEFAULT '[]',
	`phones_json` text DEFAULT '[]',
	`payment_methods_json` text DEFAULT '[]',
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`merchant` text NOT NULL,
	`merchant_normalized` text NOT NULL,
	`product_name` text,
	`category` text NOT NULL,
	`purchase_date` integer NOT NULL,
	`amount` real,
	`receipt_path` text,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_user_date` ON `purchases` (`user_id`,`purchase_date`);--> statement-breakpoint
CREATE INDEX `idx_purchase_merchant` ON `purchases` (`merchant_normalized`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`canonical_key` text NOT NULL,
	`source` text NOT NULL,
	`source_url` text NOT NULL,
	`case_name` text NOT NULL,
	`defendant` text NOT NULL,
	`defendant_aliases` text DEFAULT '[]',
	`category` text DEFAULT 'UNKNOWN' NOT NULL,
	`class_definition` text NOT NULL,
	`class_period_start` integer,
	`class_period_end` integer,
	`deadline` integer,
	`proof_required` integer DEFAULT false NOT NULL,
	`payout_estimate` text,
	`payout_structure` text,
	`claim_form_url` text,
	`administrator` text DEFAULT 'unknown' NOT NULL,
	`captcha_type` text DEFAULT 'unknown' NOT NULL,
	`form_schema_json` text,
	`status` text DEFAULT 'DISCOVERED' NOT NULL,
	`raw_json` text,
	`discovered_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_settlement_canonical_key` ON `settlements` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `idx_settlement_deadline` ON `settlements` (`deadline`);--> statement-breakpoint
CREATE INDEX `idx_settlement_status` ON `settlements` (`status`);--> statement-breakpoint
CREATE INDEX `idx_settlement_category` ON `settlements` (`category`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);