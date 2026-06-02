// =============================================================================
// Class Action Bot - Drizzle schema
// =============================================================================
// Every user-owned table FKs to users.id from day one.
// This is the most important decision for hosted SaaS operation: every
// query will filter by userId, and we never have to backfill that later.
//
// Legal safeguards live in this file as DB constraints where possible:
//   - claims.classAuthorizationId is NOT NULL with ON DELETE RESTRICT
//   - audit_log is intended to be append-only; the ORM layer in src/lib/audit
//     exposes only insert + select, no update/delete
//   - settlements.canonicalKey is UNIQUE per source to enforce scraper dedup
// =============================================================================

import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  integer,
  text,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// -----------------------------------------------------------------------------
// Shared enums (stored as TEXT, typed via TS unions)
// -----------------------------------------------------------------------------

export const SETTLEMENT_SOURCES = [
  'classaction_org',
  'top_class_actions',
  'manual',
] as const;
export type SettlementSource = (typeof SETTLEMENT_SOURCES)[number];

export const SETTLEMENT_CATEGORIES = [
  'CONSUMER_PRODUCT_PURCHASE',
  'SUBSCRIPTION_SERVICE',
  'DATA_BREACH',
  'ROBOCALL_TCPA',
  'DECEPTIVE_ADVERTISING',
  'AUTO_DEFECT',
  'EMPLOYMENT',
  'UNKNOWN',
] as const;
export type SettlementCategory = (typeof SETTLEMENT_CATEGORIES)[number];

export const SETTLEMENT_STATUSES = [
  'DISCOVERED',
  'ENRICHED',
  'EXPIRED',
  'CLOSED',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const ADMINISTRATORS = [
  'epiq',
  'simpluris',
  'verita',
  'angeion',
  'kcc',
  'gilardi',
  'atticus',
  'jnd',
  'unknown',
] as const;
export type Administrator = (typeof ADMINISTRATORS)[number];

export const CAPTCHA_TYPES = [
  'none',
  'cloudflare_turnstile',
  'recaptcha_v2',
  'recaptcha_v3',
  'hcaptcha',
  'unknown',
] as const;
export type CaptchaType = (typeof CAPTCHA_TYPES)[number];

export const VERDICT = ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'] as const;
export type Verdict = (typeof VERDICT)[number];

export const CLAIM_STATUSES = [
  'QUEUED',
  'PREFLIGHT',
  'FILING',
  'FILED',
  'FAILED',
  'PAID',
  'ABORTED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const SUBSCRIPTION_PLANS = ['free', 'plus', 'pro', 'founding'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ['inactive', 'trialing', 'active', 'past_due', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const JOB_TYPES = [
  'scrape_ingest',
  'enrich_settlement',
  'run_matcher',
  'file_claim',
  'hibp_refresh',
  'daily_summary',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AUDIT_EVENT_TYPES = [
  // scraper
  'SCRAPE_STARTED',
  'SCRAPE_COMPLETED',
  'SCRAPE_FAILED',
  'SETTLEMENT_DISCOVERED',
  'SETTLEMENT_UPDATED',
  'SOURCE_ENRICHMENT_COMPLETED',
  'SOURCE_CATALOG_IMPORTED',
  // matcher
  'MATCH_PRODUCED',
  'MATCH_VERDICT_CHANGED',
  'MATCHER_RUN_COMPLETED',
  // intake facts
  'PROFILE_UPDATED',
  'PURCHASE_ADDED',
  'BREACH_ADDED',
  'SETUP_SHADOW_REVIEW_STARTED',
  'USER_TERMS_ACKNOWLEDGED',
  // authorizations
  'AUTHORIZATION_GRANTED',
  'AUTHORIZATION_REVOKED',
  // claims
  'CLAIM_QUEUED',
  'CLAIM_QUEUE_BLOCKED',
  'CLAIM_PREFLIGHT_PASSED',
  'CLAIM_PREFLIGHT_ABORTED',
  'CLAIM_FILING_STARTED',
  'CLAIM_FILED',
  'CLAIM_FAILED',
  'CLAIM_PAID',
  // billing
  'BILLING_CHECKOUT_STARTED',
  'BILLING_ENTITLEMENT_SYNCED',
  // privacy/account controls
  'PRIVACY_EXPORT_CREATED',
  'PRIVACY_REQUEST_CREATED',
  // hosted auth/session bridge
  'AUTH_SESSION_CREATED',
  'AUTH_SESSION_ENDED',
  // system
  'JOB_ENQUEUED',
  'JOB_COMPLETED',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

// -----------------------------------------------------------------------------
// users - source of truth for tenant identity.
// -----------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  externalSubject: text('external_subject'),
  displayName: text('display_name'),
  subscriptionPlan: text('subscription_plan', { enum: SUBSCRIPTION_PLANS })
    .notNull()
    .default('free'),
  subscriptionStatus: text('subscription_status', { enum: SUBSCRIPTION_STATUSES })
    .notNull()
    .default('inactive'),
  subscriptionUpdatedAt: integer('subscription_updated_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  byExternalSubject: uniqueIndex('uniq_users_external_subject').on(t.externalSubject),
}));

// -----------------------------------------------------------------------------.
// billing_events - idempotency ledger for processor callbacks.
// -----------------------------------------------------------------------------

export const billingEvents = sqliteTable(
  'billing_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: text('event_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    processor: text('processor').notNull(),
    plan: text('plan', { enum: SUBSCRIPTION_PLANS }).notNull(),
    status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull(),
    externalCustomerIdPresent: integer('external_customer_id_present', { mode: 'boolean' })
      .notNull()
      .default(false),
    externalSubscriptionIdPresent: integer('external_subscription_id_present', { mode: 'boolean' })
      .notNull()
      .default(false),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqEvent: uniqueIndex('uniq_billing_event_id').on(t.eventId),
    byUser: index('idx_billing_event_user').on(t.userId),
    byProcessedAt: index('idx_billing_event_processed_at').on(t.processedAt),
  }),
);

// -----------------------------------------------------------------------------
// settlements - canonical, deduped record of every class action we've found
// -----------------------------------------------------------------------------

export const settlements = sqliteTable(
  'settlements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // canonical key is a hash of (normalized defendant + class period + source)
    // so the same underlying case from two sources dedupes after normalize pass
    canonicalKey: text('canonical_key').notNull(),

    source: text('source', { enum: SETTLEMENT_SOURCES }).notNull(),
    sourceUrl: text('source_url').notNull(),

    caseName: text('case_name').notNull(),
    defendant: text('defendant').notNull(),
    defendantAliases: text('defendant_aliases', { mode: 'json' })
      .$type<string[]>()
      .default(sql`'[]'`),

    category: text('category', { enum: SETTLEMENT_CATEGORIES })
      .notNull()
      .default('UNKNOWN'),

    // stored VERBATIM so we never paraphrase legal language the user attested to
    classDefinition: text('class_definition').notNull(),

    classPeriodStart: integer('class_period_start', { mode: 'timestamp_ms' }),
    classPeriodEnd: integer('class_period_end', { mode: 'timestamp_ms' }),

    deadline: integer('deadline', { mode: 'timestamp_ms' }),

    proofRequired: integer('proof_required', { mode: 'boolean' })
      .notNull()
      .default(false),

    payoutEstimate: text('payout_estimate'),        // e.g. "$5 - $50"
    payoutStructure: text('payout_structure'),       // "tiered" | "pro_rata" | "fixed"

    claimFormUrl: text('claim_form_url'),
    administrator: text('administrator', { enum: ADMINISTRATORS })
      .notNull()
      .default('unknown'),
    captchaType: text('captcha_type', { enum: CAPTCHA_TYPES })
      .notNull()
      .default('unknown'),

    // cached form schema after enrichment pass
    formSchemaJson: text('form_schema_json', { mode: 'json' }),

    status: text('status', { enum: SETTLEMENT_STATUSES })
      .notNull()
      .default('DISCOVERED'),

    // raw JSON snapshot from the scraper - useful for debugging normalization
    rawJson: text('raw_json', { mode: 'json' }),

    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    // canonicalKey must be unique globally, not per-source. That's how we
    // dedupe the same case scraped from two different sources.
    uniqCanonicalKey: uniqueIndex('uniq_settlement_canonical_key').on(
      t.canonicalKey,
    ),
    byDeadline: index('idx_settlement_deadline').on(t.deadline),
    byStatus: index('idx_settlement_status').on(t.status),
    byCategory: index('idx_settlement_category').on(t.category),
  }),
);

// -----------------------------------------------------------------------------
// audit_log - append-only. The ORM layer in src/lib/audit exposes insert/select
// only, never update or delete.
// -----------------------------------------------------------------------------

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // FK to users - every event belongs to someone. Even system events use
    // the current user's id so tenant-scoped queries remain reliable.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    eventType: text('event_type', { enum: AUDIT_EVENT_TYPES }).notNull(),

    // polymorphic entity reference - entity type + numeric id
    entityType: text('entity_type').notNull(),  // 'settlement' | 'claim' | 'match' | 'authorization' | 'job'
    entityId: integer('entity_id').notNull(),

    // full snapshot of the event's payload for forensic replay
    payloadJson: text('payload_json', { mode: 'json' }).notNull(),

    actor: text('actor').notNull(),           // 'scraper' | 'matcher' | 'filer' | 'user' | 'system'

    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('idx_audit_user').on(t.userId),
    byEntity: index('idx_audit_entity').on(t.entityType, t.entityId),
    byType: index('idx_audit_type').on(t.eventType),
    byTime: index('idx_audit_time').on(t.occurredAt),
  }),
);

// -----------------------------------------------------------------------------
// jobs - worker queue. DB polling is simple enough for the first hosted worker.
// -----------------------------------------------------------------------------

export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    type: text('type', { enum: JOB_TYPES }).notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('pending'),
    priority: integer('priority').notNull().default(100),

    payloadJson: text('payload_json', { mode: 'json' }),

    runAfter: integer('run_after', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),

    // lock fields so two worker boots can't race the same job
    lockedBy: text('locked_by'),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),

    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    byStatusRunAfter: index('idx_jobs_pick').on(t.status, t.runAfter),
    byType: index('idx_jobs_type').on(t.type),
  }),
);

// -----------------------------------------------------------------------------
// Product tables are defined together so drizzle-kit generates one coherent
// migration set and the local database does not drift from hosted schema.
// -----------------------------------------------------------------------------

export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  legalName: text('legal_name'),
  dateOfBirth: integer('date_of_birth', { mode: 'timestamp_ms' }),
  addressesJson: text('addresses_json', { mode: 'json' })
    .$type<
      Array<{
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
        from?: number;
        to?: number | null;
      }>
    >()
    .default(sql`'[]'`),
  emailsJson: text('emails_json', { mode: 'json' })
    .$type<string[]>()
    .default(sql`'[]'`),
  phonesJson: text('phones_json', { mode: 'json' })
    .$type<string[]>()
    .default(sql`'[]'`),
  // encrypted w/ libsodium - only last4 + brand are stored as plaintext hints
  paymentMethodsJson: text('payment_methods_json', { mode: 'json' }).default(
    sql`'[]'`,
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const PURCHASE_SOURCES = ['manual', 'email_scan', 'bank_import'] as const;
export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];

export const purchases = sqliteTable(
  'purchases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    merchant: text('merchant').notNull(),
    merchantNormalized: text('merchant_normalized').notNull(),
    productName: text('product_name'),
    category: text('category', { enum: SETTLEMENT_CATEGORIES }).notNull(),
    purchaseDate: integer('purchase_date', { mode: 'timestamp_ms' }).notNull(),
    amount: real('amount'),
    receiptPath: text('receipt_path'),
    source: text('source', { enum: PURCHASE_SOURCES }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUserDate: index('idx_purchase_user_date').on(t.userId, t.purchaseDate),
    byMerchant: index('idx_purchase_merchant').on(t.merchantNormalized),
  }),
);

export const BREACH_SOURCES = ['hibp', 'manual'] as const;
export type BreachSource = (typeof BREACH_SOURCES)[number];

export const dataBreachExposure = sqliteTable(
  'data_breach_exposure',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    breachName: text('breach_name').notNull(),
    breachDate: integer('breach_date', { mode: 'timestamp_ms' }),
    email: text('email').notNull(),
    source: text('source', { enum: BREACH_SOURCES }).notNull(),
    dataClassesJson: text('data_classes_json', { mode: 'json' })
      .$type<string[]>()
      .default(sql`'[]'`),
    hibpBreachId: text('hibp_breach_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqUserBreachEmail: uniqueIndex('uniq_breach_user_name_email').on(
      t.userId,
      t.breachName,
      t.email,
    ),
  }),
);

// -----------------------------------------------------------------------------
// class_authorizations - LEGALLY CRITICAL
// -----------------------------------------------------------------------------
// This table IS the user's attestation. `attestationText` is stored verbatim
// and never paraphrased. Revoking an authorization must cancel every queued
// claim that references it (enforced by the revocation transaction in
// src/lib/permissions, not by the schema).
// -----------------------------------------------------------------------------

export const classAuthorizations = sqliteTable(
  'class_authorizations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category', { enum: SETTLEMENT_CATEGORIES }).notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    authorizedAt: integer('authorized_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    attestationText: text('attestation_text').notNull(), // VERBATIM
    attestationVersion: integer('attestation_version').notNull().default(1),
    scopeConstraintsJson: text('scope_constraints_json', { mode: 'json' }),
  },
  (t) => ({
    uniqUserCategory: uniqueIndex('uniq_auth_user_category').on(
      t.userId,
      t.category,
    ),
  }),
);

// -----------------------------------------------------------------------------
// matches - matcher output. One row per (user, settlement) pair.
// -----------------------------------------------------------------------------

export const matches = sqliteTable(
  'matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    settlementId: integer('settlement_id')
      .notNull()
      .references(() => settlements.id, { onDelete: 'cascade' }),
    verdict: text('verdict', { enum: VERDICT }).notNull(),
    confidence: real('confidence').notNull(),
    reasoningJson: text('reasoning_json', { mode: 'json' }).notNull(),
    matchedFieldsJson: text('matched_fields_json', { mode: 'json' }),
    requiredCategory: text('required_category', { enum: SETTLEMENT_CATEGORIES }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqUserSettlement: uniqueIndex('uniq_match_user_settlement').on(
      t.userId,
      t.settlementId,
    ),
    byVerdict: index('idx_match_verdict').on(t.verdict),
  }),
);

// -----------------------------------------------------------------------------
// claims - cannot exist without an active authorization (NOT NULL + RESTRICT)
// -----------------------------------------------------------------------------

export const claims = sqliteTable(
  'claims',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    settlementId: integer('settlement_id')
      .notNull()
      .references(() => settlements.id, { onDelete: 'restrict' }),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'restrict' }),

    // THE MOST IMPORTANT CONSTRAINT IN THE PROJECT:
    // every claim must reference an active authorization, and deleting an
    // authorization is forbidden while claims reference it (ON DELETE RESTRICT).
    classAuthorizationId: integer('class_authorization_id')
      .notNull()
      .references(() => classAuthorizations.id, { onDelete: 'restrict' }),

    status: text('status', { enum: CLAIM_STATUSES }).notNull().default('QUEUED'),

    submittedFormDataJson: text('submitted_form_data_json', { mode: 'json' }),

    // captured verbatim from DOM at submit time - if this is empty, the
    // filer must abort before clicking submit.
    submittedAttestationText: text('submitted_attestation_text'),

    confirmationId: text('confirmation_id'),
    screenshotEmptyFormPath: text('screenshot_empty_form_path'),
    screenshotFilledFormPath: text('screenshot_filled_form_path'),
    screenshotConfirmationPath: text('screenshot_confirmation_path'),
    pdfReceiptPath: text('pdf_receipt_path'),

    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),

    queuedAt: integer('queued_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    filedAt: integer('filed_at', { mode: 'timestamp_ms' }),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    uniqMatch: uniqueIndex('uniq_claim_match').on(t.matchId),
    byStatus: index('idx_claim_status').on(t.status),
    byUser: index('idx_claim_user').on(t.userId),
  }),
);

// -----------------------------------------------------------------------------
// form_templates - cache form schemas keyed by administrator + signature hash
// -----------------------------------------------------------------------------

export const formTemplates = sqliteTable(
  'form_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    administrator: text('administrator', { enum: ADMINISTRATORS }).notNull(),
    signatureHash: text('signature_hash').notNull(),
    schemaJson: text('schema_json', { mode: 'json' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    usageCount: integer('usage_count').notNull().default(0),
  },
  (t) => ({
    uniqAdminSig: uniqueIndex('uniq_template_admin_sig').on(
      t.administrator,
      t.signatureHash,
    ),
  }),
);

// -----------------------------------------------------------------------------
// settings - simple key/value store for runtime config (webhook, HIBP key,
// filer mode, etc.) so the GUI can configure everything without .env files.
// -----------------------------------------------------------------------------

export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
);

// Known setting keys - typed so the settings page can enumerate them.
export const SETTING_KEYS = [
  'discord_webhook_url',
  'hibp_api_key',
  'claim_filer_mode',        // 'shadow' | 'live'
  'claim_filer_live_ack',    // 'reviewed' when live mode has been explicitly acknowledged
  'claim_filer_max_per_day',
  'setup_completed',          // 'true' when wizard is done
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

// -----------------------------------------------------------------------------
// TS type exports (Drizzle infer)
// -----------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Profile = typeof profile.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type DataBreachExposure = typeof dataBreachExposure.$inferSelect;
export type ClassAuthorization = typeof classAuthorizations.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type Setting = typeof settings.$inferSelect;
