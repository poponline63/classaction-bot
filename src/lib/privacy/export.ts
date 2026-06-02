import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@db/client';
import { buildAuditCheckpoint } from '@lib/audit/support-packet';
import { sha256Digest } from '@lib/audit/claim-export';

export async function buildPrivacyExport(userId: number) {
  const [
    userRows,
    profileRows,
    purchases,
    breaches,
    authorizations,
    matches,
    claims,
    billingEvents,
    auditEvents,
  ] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        hostedIdentitySubjectPresent: schema.users.externalSubject,
        subscriptionPlan: schema.users.subscriptionPlan,
        subscriptionStatus: schema.users.subscriptionStatus,
        subscriptionUpdatedAt: schema.users.subscriptionUpdatedAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, userId))
      .limit(1),
    db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.userId, userId))
      .orderBy(desc(schema.purchases.purchaseDate)),
    db
      .select()
      .from(schema.dataBreachExposure)
      .where(eq(schema.dataBreachExposure.userId, userId))
      .orderBy(desc(schema.dataBreachExposure.createdAt)),
    db
      .select()
      .from(schema.classAuthorizations)
      .where(eq(schema.classAuthorizations.userId, userId)),
    db
      .select({
        match: schema.matches,
        settlement: {
          id: schema.settlements.id,
          caseName: schema.settlements.caseName,
          defendant: schema.settlements.defendant,
          category: schema.settlements.category,
          deadline: schema.settlements.deadline,
          proofRequired: schema.settlements.proofRequired,
          claimFormUrl: schema.settlements.claimFormUrl,
          source: schema.settlements.source,
          sourceUrl: schema.settlements.sourceUrl,
        },
      })
      .from(schema.matches)
      .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
      .where(eq(schema.matches.userId, userId))
      .orderBy(desc(schema.matches.updatedAt)),
    db
      .select({
        claim: schema.claims,
        settlement: {
          id: schema.settlements.id,
          caseName: schema.settlements.caseName,
          defendant: schema.settlements.defendant,
          category: schema.settlements.category,
          deadline: schema.settlements.deadline,
          proofRequired: schema.settlements.proofRequired,
        },
        authorization: {
          id: schema.classAuthorizations.id,
          category: schema.classAuthorizations.category,
          enabled: schema.classAuthorizations.enabled,
          authorizedAt: schema.classAuthorizations.authorizedAt,
          revokedAt: schema.classAuthorizations.revokedAt,
          attestationText: schema.classAuthorizations.attestationText,
          attestationVersion: schema.classAuthorizations.attestationVersion,
        },
      })
      .from(schema.claims)
      .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
      .innerJoin(
        schema.classAuthorizations,
        eq(schema.claims.classAuthorizationId, schema.classAuthorizations.id),
      )
      .where(eq(schema.claims.userId, userId))
      .orderBy(desc(schema.claims.queuedAt)),
    db
      .select({
        eventId: schema.billingEvents.eventId,
        processor: schema.billingEvents.processor,
        plan: schema.billingEvents.plan,
        status: schema.billingEvents.status,
        email: schema.billingEvents.email,
        externalCustomerIdPresent: schema.billingEvents.externalCustomerIdPresent,
        externalSubscriptionIdPresent: schema.billingEvents.externalSubscriptionIdPresent,
        processedAt: schema.billingEvents.processedAt,
      })
      .from(schema.billingEvents)
      .where(eq(schema.billingEvents.userId, userId))
      .orderBy(desc(schema.billingEvents.processedAt)),
    db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.userId, userId))
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(500),
  ]);

  const user = userRows[0] ?? null;
  const profile = profileRows[0] ?? null;
  const exportBody = {
    format: 'claimbot.privacy-export.v1',
    generatedAt: new Date(),
    accountId: userId,
    account: user && {
      ...user,
      hostedIdentitySubjectPresent: Boolean(user.hostedIdentitySubjectPresent),
    },
    profile: profile && {
      id: profile.id,
      userId: profile.userId,
      legalName: profile.legalName,
      dateOfBirth: profile.dateOfBirth,
      addressesJson: profile.addressesJson,
      emailsJson: profile.emailsJson,
      phonesJson: profile.phonesJson,
      paymentMethodsExcluded: true,
      paymentMethodRecordPresent: Boolean(profile.paymentMethodsJson),
      updatedAt: profile.updatedAt,
    },
    records: {
      purchases,
      dataBreachExposure: breaches,
      classAuthorizations: authorizations,
      matches,
      claims,
      billingEvents,
      auditEvents,
    },
    counts: {
      purchases: purchases.length,
      dataBreachExposure: breaches.length,
      classAuthorizations: authorizations.length,
      matches: matches.length,
      claims: claims.length,
      billingEvents: billingEvents.length,
      auditEvents: auditEvents.length,
    },
    privacyRequestBoundary: {
      exportIncludes: [
        'account identity fields',
        'profile and contact facts',
        'purchase facts',
        'data-breach exposure records',
        'category authorizations and verbatim attestations',
        'match reasoning',
        'claim preparation state',
        'billing entitlement ledger entries',
        'recent audit events',
      ],
      paymentCardData: 'Processor card data is not stored by ClaimBot and is not included.',
      deletionRequests: 'Deletion or correction requests should go through the monitored support/privacy process so profile facts and evidence can be removed or anonymized while preserving required audit, fraud-prevention, legal, or accounting records.',
      auditEventsLimitedToMostRecent: 500,
    },
    auditCheckpoint: buildAuditCheckpoint(auditEvents),
  };

  return {
    ...exportBody,
    digest: {
      algorithm: 'sha256',
      value: sha256Digest(exportBody),
      note: 'Recompute this digest over the export without the digest field to detect accidental changes.',
    },
  };
}
