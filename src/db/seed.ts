// Seed the local development user. Idempotent.
import { client, databaseUrl, db, schema } from './client';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

let cachedUserId: number | null = null;
const cachedUserIdsByEmail = new Map<string, number>();
let runtimeReady: Promise<void> | null = null;

const RUNTIME_MIGRATIONS = [
  [
    "CREATE TABLE IF NOT EXISTS `users` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `email` text NOT NULL, `display_name` text, `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`)",
    "CREATE TABLE IF NOT EXISTS `settlements` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `canonical_key` text NOT NULL, `source` text NOT NULL, `source_url` text NOT NULL, `case_name` text NOT NULL, `defendant` text NOT NULL, `defendant_aliases` text DEFAULT '[]', `category` text DEFAULT 'UNKNOWN' NOT NULL, `class_definition` text NOT NULL, `class_period_start` integer, `class_period_end` integer, `deadline` integer, `proof_required` integer DEFAULT false NOT NULL, `payout_estimate` text, `payout_structure` text, `claim_form_url` text, `administrator` text DEFAULT 'unknown' NOT NULL, `captcha_type` text DEFAULT 'unknown' NOT NULL, `form_schema_json` text, `status` text DEFAULT 'DISCOVERED' NOT NULL, `raw_json` text, `discovered_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_settlement_canonical_key` ON `settlements` (`canonical_key`)",
    "CREATE INDEX IF NOT EXISTS `idx_settlement_deadline` ON `settlements` (`deadline`)",
    "CREATE INDEX IF NOT EXISTS `idx_settlement_status` ON `settlements` (`status`)",
    "CREATE INDEX IF NOT EXISTS `idx_settlement_category` ON `settlements` (`category`)",
    "CREATE TABLE IF NOT EXISTS `profile` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `legal_name` text, `date_of_birth` integer, `addresses_json` text DEFAULT '[]', `emails_json` text DEFAULT '[]', `phones_json` text DEFAULT '[]', `payment_methods_json` text DEFAULT '[]', `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade)",
    "CREATE TABLE IF NOT EXISTS `purchases` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `merchant` text NOT NULL, `merchant_normalized` text NOT NULL, `product_name` text, `category` text NOT NULL, `purchase_date` integer NOT NULL, `amount` real, `receipt_path` text, `source` text NOT NULL, `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade)",
    "CREATE INDEX IF NOT EXISTS `idx_purchase_user_date` ON `purchases` (`user_id`,`purchase_date`)",
    "CREATE INDEX IF NOT EXISTS `idx_purchase_merchant` ON `purchases` (`merchant_normalized`)",
    "CREATE TABLE IF NOT EXISTS `data_breach_exposure` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `breach_name` text NOT NULL, `breach_date` integer, `email` text NOT NULL, `source` text NOT NULL, `data_classes_json` text DEFAULT '[]', `hibp_breach_id` text, `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_breach_user_name_email` ON `data_breach_exposure` (`user_id`,`breach_name`,`email`)",
    "CREATE TABLE IF NOT EXISTS `class_authorizations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `category` text NOT NULL, `enabled` integer DEFAULT false NOT NULL, `authorized_at` integer, `revoked_at` integer, `attestation_text` text NOT NULL, `attestation_version` integer DEFAULT 1 NOT NULL, `scope_constraints_json` text, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_auth_user_category` ON `class_authorizations` (`user_id`,`category`)",
    "CREATE TABLE IF NOT EXISTS `matches` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `settlement_id` integer NOT NULL, `verdict` text NOT NULL, `confidence` real NOT NULL, `reasoning_json` text NOT NULL, `matched_fields_json` text, `required_category` text, `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_match_user_settlement` ON `matches` (`user_id`,`settlement_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_match_verdict` ON `matches` (`verdict`)",
    "CREATE TABLE IF NOT EXISTS `claims` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `settlement_id` integer NOT NULL, `match_id` integer NOT NULL, `class_authorization_id` integer NOT NULL, `status` text DEFAULT 'QUEUED' NOT NULL, `submitted_form_data_json` text, `submitted_attestation_text` text, `confirmation_id` text, `screenshot_empty_form_path` text, `screenshot_filled_form_path` text, `screenshot_confirmation_path` text, `pdf_receipt_path` text, `retry_count` integer DEFAULT 0 NOT NULL, `last_error` text, `queued_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, `filed_at` integer, `paid_at` integer, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict, FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE restrict, FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE restrict, FOREIGN KEY (`class_authorization_id`) REFERENCES `class_authorizations`(`id`) ON UPDATE no action ON DELETE restrict)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_claim_match` ON `claims` (`match_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_claim_status` ON `claims` (`status`)",
    "CREATE INDEX IF NOT EXISTS `idx_claim_user` ON `claims` (`user_id`)",
    "CREATE TABLE IF NOT EXISTS `jobs` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `type` text NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `priority` integer DEFAULT 100 NOT NULL, `payload_json` text, `run_after` integer DEFAULT (unixepoch() * 1000) NOT NULL, `locked_by` text, `locked_at` integer, `attempts` integer DEFAULT 0 NOT NULL, `max_attempts` integer DEFAULT 3 NOT NULL, `last_error` text, `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, `completed_at` integer, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict)",
    "CREATE INDEX IF NOT EXISTS `idx_jobs_pick` ON `jobs` (`status`,`run_after`)",
    "CREATE INDEX IF NOT EXISTS `idx_jobs_type` ON `jobs` (`type`)",
    "CREATE TABLE IF NOT EXISTS `audit_log` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `user_id` integer NOT NULL, `event_type` text NOT NULL, `entity_type` text NOT NULL, `entity_id` integer NOT NULL, `payload_json` text NOT NULL, `actor` text NOT NULL, `occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict)",
    "CREATE INDEX IF NOT EXISTS `idx_audit_user` ON `audit_log` (`user_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_audit_type` ON `audit_log` (`event_type`)",
    "CREATE INDEX IF NOT EXISTS `idx_audit_time` ON `audit_log` (`occurred_at`)",
    "CREATE TABLE IF NOT EXISTS `form_templates` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `administrator` text NOT NULL, `signature_hash` text NOT NULL, `schema_json` text NOT NULL, `last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, `usage_count` integer DEFAULT 0 NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_template_admin_sig` ON `form_templates` (`administrator`,`signature_hash`)",
    "CREATE TABLE IF NOT EXISTS `settings` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL, `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL)",
    "CREATE TABLE IF NOT EXISTS `billing_events` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `event_id` text NOT NULL, `user_id` integer NOT NULL, `email` text NOT NULL, `processor` text NOT NULL, `plan` text NOT NULL, `status` text NOT NULL, `external_customer_id_present` integer DEFAULT false NOT NULL, `external_subscription_id_present` integer DEFAULT false NOT NULL, `processed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_billing_event_id` ON `billing_events` (`event_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_billing_event_user` ON `billing_events` (`user_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_billing_event_processed_at` ON `billing_events` (`processed_at`)",
  ],
  [
    "ALTER TABLE `users` ADD `subscription_plan` text DEFAULT 'free' NOT NULL",
    "ALTER TABLE `users` ADD `subscription_status` text DEFAULT 'inactive' NOT NULL",
    "ALTER TABLE `users` ADD `subscription_updated_at` integer",
    "ALTER TABLE `users` ADD `external_subject` text",
    "CREATE UNIQUE INDEX IF NOT EXISTS `uniq_users_external_subject` ON `users` (`external_subject`)",
  ],
] as const;

async function executeIgnoringDuplicateColumn(sql: string) {
  try {
    await client.execute(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes('duplicate column name') || message.includes('already exists')) return;
    throw error;
  }
}

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('unique constraint failed') || message.includes('sqlite_constraint_unique');
}

async function ensureRuntimeDatabaseReady() {
  if (runtimeReady) return runtimeReady;
  runtimeReady = (async () => {
    if (process.env.CLAIMBOT_SINGLE_USER_FILE_DB !== 'true' || !databaseUrl.startsWith('file:')) return;
    for (const group of RUNTIME_MIGRATIONS) {
      for (const statement of group) await executeIgnoringDuplicateColumn(statement);
    }
  })();
  return runtimeReady;
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? '';
  return normalized.includes('@') ? normalized : '';
}

function normalizeSubject(subject: string) {
  return subject.trim();
}

export function fallbackEmailForIdentitySubject(subject: string) {
  const normalizedSubject = normalizeSubject(subject);
  const digest = createHash('sha256').update(normalizedSubject).digest('hex').slice(0, 24);
  return `identity+${digest}@claimbot.local`;
}

export async function ensureSingleUser(): Promise<number> {
  await ensureRuntimeDatabaseReady();
  if (cachedUserId != null) return cachedUserId;
  const email = process.env.SINGLE_USER_EMAIL ?? 'you@example.com';
  cachedUserId = await ensureUserForEmail(email, 'Local Dev User');
  return cachedUserId;
}

export async function ensureUserForEmail(email: string, displayName = email): Promise<number> {
  await ensureRuntimeDatabaseReady();
  const normalizedEmail = email.trim().toLowerCase();
  const cached = cachedUserIdsByEmail.get(normalizedEmail);
  if (cached != null) return cached;

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);
  if (existing.length > 0) {
    cachedUserIdsByEmail.set(normalizedEmail, existing[0]!.id);
    return existing[0]!.id;
  }
  try {
    const inserted = await db
      .insert(schema.users)
      .values({ email: normalizedEmail, displayName })
      .returning();
    cachedUserIdsByEmail.set(normalizedEmail, inserted[0]!.id);
    return inserted[0]!.id;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);
    if (raced[0]) {
      cachedUserIdsByEmail.set(normalizedEmail, raced[0].id);
      return raced[0].id;
    }
    throw error;
  }
}

export async function ensureUserForIdentity(
  subject: string,
  email?: string | null,
  displayName?: string | null,
): Promise<number> {
  await ensureRuntimeDatabaseReady();
  const externalSubject = normalizeSubject(subject);
  if (!externalSubject) {
    throw new Error('Hosted identity subject is required.');
  }

  const normalizedEmail = normalizeEmail(email);
  const preferredEmail = normalizedEmail || fallbackEmailForIdentitySubject(externalSubject);
  const preferredDisplayName = displayName?.trim() || normalizedEmail || 'Identity user';

  const userId = await db.transaction(async (tx) => {
    const bySubject = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.externalSubject, externalSubject))
      .limit(1);

    if (bySubject.length > 0) {
      const user = bySubject[0]!;
      const update: Partial<typeof schema.users.$inferInsert> = {
        displayName: preferredDisplayName,
      };

      if (normalizedEmail && user.email !== normalizedEmail) {
        const emailOwner = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, normalizedEmail))
          .limit(1);

        if (!emailOwner[0] || emailOwner[0].id === user.id) {
          update.email = normalizedEmail;
        }
      }

      await tx.update(schema.users).set(update).where(eq(schema.users.id, user.id));
      return user.id;
    }

    if (normalizedEmail) {
      const byEmail = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);

      if (byEmail.length > 0) {
        const user = byEmail[0]!;
        await tx
          .update(schema.users)
          .set({
            externalSubject,
            displayName: preferredDisplayName,
          })
          .where(eq(schema.users.id, user.id));
        return user.id;
      }
    }

    const inserted = await tx
      .insert(schema.users)
      .values({
        email: preferredEmail,
        externalSubject,
        displayName: preferredDisplayName,
      })
      .returning({ id: schema.users.id });
    return inserted[0]!.id;
  }).catch(async (error) => {
    if (!isUniqueConstraintError(error)) throw error;

    const bySubject = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.externalSubject, externalSubject))
      .limit(1);
    if (bySubject[0]) return bySubject[0].id;

    const byEmail = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, preferredEmail))
      .limit(1);
    if (byEmail[0]) return byEmail[0].id;

    throw error;
  });

  cachedUserIdsByEmail.set(preferredEmail, userId);
  return userId;
}
