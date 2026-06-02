import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getLaunchPacketArtifactRows,
  getLaunchPacketNextAction,
  summarizeLaunchPacketArtifactRows,
} from '../../src/lib/launch-packet-stack';

const roots: string[] = [];

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-launch-packet-stack-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  return root;
}

function writePacket(root: string, name: string, json: unknown) {
  fs.writeFileSync(path.join(root, 'data', `${name}.md`), `# ${name}\n`);
  fs.writeFileSync(path.join(root, 'data', `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
}

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('getLaunchPacketArtifactRows', () => {
  it('marks present packet artifacts blocked when their JSON readiness gate is false', () => {
    const root = tempRoot();
    writePacket(root, 'hosted-database-packet', {
      approvalBoundary: {
        hostedDatabaseReady: false,
        readyRequires: ['Real hosted DATABASE_URL', 'Hosted migrations run'],
      },
    });

    const rows = getLaunchPacketArtifactRows({ exists: false, errorCount: null }, root);
    const hostedDatabase = rows.find((row) => row.path === 'data/hosted-database-packet.md');

    expect(hostedDatabase).toMatchObject({
      ready: false,
      tone: 'warn',
      statusLabel: 'Packet blocked',
      command: 'npm run hosted:db:packet',
    });
    expect(hostedDatabase?.statusDetail).toContain('Hosted database readiness is still blocked');
    expect(hostedDatabase?.missingInputs).toEqual([
      'Real hosted DATABASE_URL',
      'Hosted migrations run',
    ]);
  });

  it('surfaces missing env keys from packet readiness companions', () => {
    const root = tempRoot();
    writePacket(root, 'billing-activation-packet', {
      approvalBoundary: {
        billingReady: false,
      },
      readiness: {
        ready: false,
        missingRequiredEnvKeys: [
          'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
          'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
        ],
        requiredOptionStatus: [
          {
            label: 'Plus monthly checkout',
            envKey: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
            configured: false,
          },
        ],
      },
    });

    const rows = getLaunchPacketArtifactRows({ exists: true, errorCount: 0 }, root);
    const billing = rows.find((row) => row.path === 'data/billing-activation-packet.md');

    expect(billing).toMatchObject({
      ready: false,
      statusLabel: 'Packet blocked',
    });
    expect(billing?.statusDetail).toContain('Missing inputs: CLAIMBOT_BILLING_PLUS_MONTHLY_URL');
    expect(billing?.missingInputs).toContain('CLAIMBOT_BILLING_PRO_MONTHLY_URL');
    expect(billing?.missingInputs).toContain('Plus monthly checkout: CLAIMBOT_BILLING_PLUS_MONTHLY_URL');
  });

  it('keeps billing packet blocked when paid automation checkout is not sale-ready', () => {
    const root = tempRoot();
    writePacket(root, 'billing-activation-packet', {
      approvalBoundary: {
        billingReady: true,
        paidAutomationSaleReady: false,
        readyRequires: [
          'Verified paid automation worker runtime receipt before Pro or Founding checkout is sold',
        ],
      },
      readiness: {
        ready: true,
        paidAutomationWorkerVerified: false,
        paidAutomationCheckoutLocks: {
          proMonthly: 'worker-runtime-not-verified',
        },
        missingRequiredEnvKeys: [],
      },
    });

    const rows = getLaunchPacketArtifactRows({ exists: true, errorCount: 0 }, root);
    const billing = rows.find((row) => row.path === 'data/billing-activation-packet.md');

    expect(billing).toMatchObject({
      ready: false,
      statusLabel: 'Packet blocked',
    });
    expect(billing?.statusDetail).toContain('Paid automation checkout readiness is still blocked');
    expect(billing?.missingInputs).toContain('Verified paid automation worker runtime receipt before Pro or Founding checkout is sold');
  });

  it('treats the Netlify launch doctor receipt as blocked from top-level readiness and blockers', () => {
    const root = tempRoot();
    writePacket(root, 'netlify-launch-doctor', {
      ready: false,
      blockers: [
        'Netlify CLI is not authenticated.',
        'SMOKE_BASE_URL is not a deployed HTTPS preview URL.',
      ],
      blockedChecks: [
        { label: 'Identity setup receipt', detail: 'confirm Identity dashboard settings' },
      ],
      readiness: {
        netlifyAuthenticated: false,
        deployedPreviewUrlReady: false,
      },
    });

    const rows = getLaunchPacketArtifactRows({ exists: true, errorCount: 0 }, root);
    const netlifyDoctor = rows.find((row) => row.path === 'data/netlify-launch-doctor.md');

    expect(netlifyDoctor).toMatchObject({
      ready: false,
      statusLabel: 'Packet blocked',
      command: 'npm run netlify:doctor',
    });
    expect(netlifyDoctor?.statusDetail).toContain('Doctor readiness is still blocked');
    expect(netlifyDoctor?.missingInputs).toEqual([
      'Netlify CLI is not authenticated.',
      'SMOKE_BASE_URL is not a deployed HTTPS preview URL.',
      'Identity setup receipt: confirm Identity dashboard settings',
    ]);
  });

  it('deduplicates Netlify doctor blocked checks already covered by grouped blockers', () => {
    const root = tempRoot();
    writePacket(root, 'netlify-launch-doctor', {
      ready: false,
      blockers: [
        'Netlify CLI is not authenticated. Run netlify login before env push, deploy, or production promotion.',
        'Hosted database values are not ready: DATABASE_URL is missing or still placeholder-only.',
        'SMOKE_BASE_URL is not a deployed HTTPS preview URL.',
      ],
      blockedChecks: [
        { label: 'Netlify authentication', detail: 'run netlify login before env push, deploy, or production promotion' },
        { label: 'Hosted database values', detail: '.env.hosted.local needs real values; no secrets printed' },
        { label: 'Deployed preview URL', detail: 'deploy a preview and set SMOKE_BASE_URL' },
        { label: 'Preview site alignment', detail: 'set NETLIFY_SITE_SLUG and use the preview URL for that site' },
        { label: 'Identity setup receipt', detail: 'confirm Identity dashboard settings, then run npm run netlify:record-setup' },
      ],
    });

    const rows = getLaunchPacketArtifactRows({ exists: true, errorCount: 0 }, root);
    const netlifyDoctor = rows.find((row) => row.path === 'data/netlify-launch-doctor.md');

    expect(netlifyDoctor?.missingInputs).toEqual([
      'Netlify CLI is not authenticated. Run netlify login before env push, deploy, or production promotion.',
      'Hosted database values are not ready: DATABASE_URL is missing or still placeholder-only.',
      'SMOKE_BASE_URL is not a deployed HTTPS preview URL.',
      'Preview site alignment: set NETLIFY_SITE_SLUG and use the preview URL for that site',
      'Identity setup receipt: confirm Identity dashboard settings, then run npm run netlify:record-setup',
    ]);
  });

  it('marks internally clear packet artifacts ready and keeps matcher receipt status separate', () => {
    const root = tempRoot();
    writePacket(root, 'pwa-readiness-packet', {
      readiness: {
        ok: true,
      },
    });

    const rows = getLaunchPacketArtifactRows({
      exists: true,
      errorCount: 0,
      occurredAt: '2026-05-27T01:33:01.000Z',
    }, root);
    const pwa = rows.find((row) => row.path === 'data/pwa-readiness-packet.md');
    const matcher = rows.find((row) => row.path === 'audit:MATCHER_RUN_COMPLETED');

    expect(pwa).toMatchObject({
      ready: true,
      tone: 'pass',
      statusLabel: 'Packet ready',
    });
    expect(matcher).toMatchObject({
      ready: true,
      statusLabel: 'Receipt ready',
      command: 'npm run matcher:receipt',
    });
  });

  it('summarizes packet stack readiness without treating generated markdown as enough proof', () => {
    const root = tempRoot();
    writePacket(root, 'hosted-database-packet', {
      approvalBoundary: {
        hostedDatabaseReady: false,
      },
    });
    writePacket(root, 'pwa-readiness-packet', {
      readiness: {
        ok: true,
      },
    });

    const summary = summarizeLaunchPacketArtifactRows(getLaunchPacketArtifactRows({
      exists: true,
      errorCount: 0,
      occurredAt: '2026-05-27T01:33:01.000Z',
    }, root));

    expect(summary.ready).toBe(false);
    expect(summary.readyLabels).toContain('PWA readiness packet');
    expect(summary.readyLabels).toContain('Matcher refresh receipt');
    expect(summary.blockedLabels).toContain('Hosted database packet');
    expect(summary.note).toContain('generated markdown alone is not treated as launch-ready proof');
  });

  it('provides plain next actions for blocked launch packets', () => {
    expect(getLaunchPacketNextAction({
      path: 'data/netlify-launch-doctor.md',
      ready: false,
      command: 'npm run netlify:doctor',
      missingInputs: ['Netlify CLI is not authenticated.'],
    })).toBe(
      'Log in to Netlify, confirm the linked site, set hosted values and preview URL, then rerun the Netlify doctor.',
    );

    expect(getLaunchPacketNextAction({
      path: 'data/custom-packet.md',
      ready: false,
      command: 'npm run custom:packet',
      missingInputs: ['Business approval receipt'],
    })).toBe(
      'Resolve the first missing input, "Business approval receipt", then rerun npm run custom:packet.',
    );
  });
});
