import { db, schema } from '@db/client';

export type DatabaseSchemaReadinessItem = {
  key: string;
  label: string;
  status: 'pass' | 'fail';
  detail: string;
};

type DatabaseSchemaProbe = {
  key: string;
  label: string;
  detail: string;
  run: () => Promise<unknown>;
};

const probes: DatabaseSchemaProbe[] = [
  {
    key: 'identity-subject-column',
    label: 'Hosted identity subject',
    detail: 'users.external_subject is available for stable hosted account mapping.',
    run: () => db.select({ externalSubject: schema.users.externalSubject }).from(schema.users).limit(1),
  },
  {
    key: 'subscription-entitlement-columns',
    label: 'Subscription entitlement columns',
    detail: 'users subscription columns are available for paid plan gates.',
    run: () => db
      .select({
        subscriptionPlan: schema.users.subscriptionPlan,
        subscriptionStatus: schema.users.subscriptionStatus,
        subscriptionUpdatedAt: schema.users.subscriptionUpdatedAt,
      })
      .from(schema.users)
      .limit(1),
  },
  {
    key: 'billing-event-ledger',
    label: 'Billing event idempotency ledger',
    detail: 'billing_events.event_id is available for signed billing callback replay protection.',
    run: () => db.select({ eventId: schema.billingEvents.eventId }).from(schema.billingEvents).limit(1),
  },
];

function errorDetail(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'schema probe failed';
}

export async function getDatabaseSchemaReadiness() {
  const results = await Promise.all(probes.map(async (probe): Promise<DatabaseSchemaReadinessItem> => {
    try {
      await probe.run();
      return {
        key: probe.key,
        label: probe.label,
        status: 'pass',
        detail: probe.detail,
      };
    } catch (error) {
      return {
        key: probe.key,
        label: probe.label,
        status: 'fail',
        detail: errorDetail(error),
      };
    }
  }));
  const failures = results.filter((item) => item.status === 'fail');

  return {
    ok: failures.length === 0,
    failures,
    items: results,
  };
}
