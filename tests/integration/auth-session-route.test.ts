import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { NextRequest } from 'next/server';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-auth-session-route-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.CLAIMBOT_SESSION_SECRET = 'auth-session-route-secret-for-tests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let POST: typeof import('../../src/app/api/auth/session/route').POST;
let DELETE: typeof import('../../src/app/api/auth/session/route').DELETE;
let createSignedSession: typeof import('../../src/lib/auth/session').createSignedSession;
let verifySignedSession: typeof import('../../src/lib/auth/session').verifySignedSession;

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const authRoute = await import('../../src/app/api/auth/session/route');
  POST = authRoute.POST;
  DELETE = authRoute.DELETE;
  const sessionMod = await import('../../src/lib/auth/session');
  createSignedSession = sessionMod.createSignedSession;
  verifySignedSession = sessionMod.verifySignedSession;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await db.delete(schema.auditLog);
  await db.delete(schema.users);
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
  delete process.env.CLAIMBOT_SESSION_SECRET;
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('/api/auth/session', () => {
  it('links the hosted Identity user, audits the app-session handoff, and sets a signed cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'netlify-client-1',
      email: 'Client@Example.COM',
      user_metadata: { full_name: 'Client Person' },
    }), { status: 200 })));

    const request = new NextRequest('http://localhost:3100/api/auth/session', {
      method: 'POST',
      headers: { authorization: 'Bearer verified-identity-token' },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('claimbot_session=');

    const signedCookie = /claimbot_session=([^;]+)/.exec(setCookie ?? '')?.[1];
    const session = await verifySignedSession(signedCookie);
    expect(session).toMatchObject({
      sub: 'netlify-client-1',
      email: 'client@example.com',
    });

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      externalSubject: 'netlify-client-1',
      email: 'client@example.com',
      displayName: 'Client Person',
    });

    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      userId: users[0].id,
      eventType: 'AUTH_SESSION_CREATED',
      entityType: 'user',
      entityId: users[0].id,
      actor: 'user',
    });
    expect(auditRows[0].payloadJson).toMatchObject({
      subjectPresent: true,
      emailPresent: true,
      source: 'netlify-identity',
      cookieName: 'claimbot_session',
    });
    expect(JSON.stringify(auditRows[0].payloadJson)).not.toContain('verified-identity-token');
  });

  it('audits explicit sign-out when a valid signed app session is present', async () => {
    const signedSession = await createSignedSession({
      sub: 'netlify-client-logout',
      email: 'logout@example.com',
    });
    const request = new NextRequest('http://localhost:3100/api/auth/session', {
      method: 'DELETE',
      headers: { cookie: `claimbot_session=${signedSession}` },
    });

    const response = await DELETE(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, audited: true });
    expect(response.headers.get('set-cookie')).toContain('claimbot_session=;');

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      externalSubject: 'netlify-client-logout',
      email: 'logout@example.com',
    });

    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      userId: users[0].id,
      eventType: 'AUTH_SESSION_ENDED',
      entityType: 'user',
      entityId: users[0].id,
      actor: 'user',
    });
    expect(auditRows[0].payloadJson).toMatchObject({
      subjectPresent: true,
      emailPresent: true,
      source: 'netlify-identity',
      cookieName: 'claimbot_session',
    });
  });
});
