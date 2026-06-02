import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import { ensureSingleUser } from '@db/seed';
import { count } from 'drizzle-orm';
import { currentMode } from '@lib/claim-filer/submit';
import { getDatabaseSchemaReadiness } from '@lib/database-schema-readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    if (process.env.CLAIMBOT_SINGLE_USER_FILE_DB === 'true') {
      await ensureSingleUser();
    }

    const [, filingMode, schemaReadiness] = await Promise.all([
      db.select({ n: count() }).from(schema.settlements),
      currentMode(),
      getDatabaseSchemaReadiness(),
    ]);

    const ok = schemaReadiness.ok;
    return NextResponse.json({
      ok,
      service: 'claimbot',
      timestamp: new Date().toISOString(),
      filingMode,
      checks: {
        database: ok ? 'ok' : 'error',
        schema: ok ? 'ok' : 'error',
        identitySubject: schemaReadiness.items.find((item) => item.key === 'identity-subject-column')?.status === 'pass',
        billingLedger: schemaReadiness.items.find((item) => item.key === 'billing-event-ledger')?.status === 'pass',
        shadowDefault: filingMode === 'shadow',
      },
    }, { status: ok ? 200 : 500 });
  } catch (error) {
    const diagnostic = process.env.CLAIMBOT_SINGLE_USER_FILE_DB === 'true'
      ? {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Error',
        }
      : undefined;

    return NextResponse.json(
      {
        ok: false,
        service: 'claimbot',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'error',
          schema: 'error',
        },
        error: 'health check failed',
        diagnostic,
      },
      { status: 500 },
    );
  }
}
