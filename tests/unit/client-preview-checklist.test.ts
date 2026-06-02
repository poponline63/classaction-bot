import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findRouteExportHygieneLeaks,
  hasCustomerRenderedCopyGuard,
  readKimiVisualPacketEvidence,
  summarizeClientPreviewChecklist,
  type ClientPreviewChecklistItem,
} from '../../src/lib/client-preview-checklist';

const baseItems: ClientPreviewChecklistItem[] = [
  {
    key: 'kimi-visual-system',
    label: 'Kimi dark-first SaaS shell',
    owner: 'codex',
    status: 'ready',
    evidence: ['src/app/KimiAppShell.tsx'],
    nextAction: 'Verify rendered layouts.',
  },
  {
    key: 'hosted-deployment-preview',
    label: 'Hosted deployment and preview promotion proof',
    owner: 'deployment',
    status: 'ready',
    evidence: ['data/preview-promotion-receipt.json'],
    nextAction: 'Run production receipt check.',
  },
];

describe('summarizeClientPreviewChecklist', () => {
  it('requires launch readiness, matcher proof, every item, and every packet before client preview clears', () => {
    const summary = summarizeClientPreviewChecklist(baseItems, {
      launchClientPreviewReady: true,
      matcherReceiptReady: true,
      launchPacketReadyCount: 15,
      launchPacketTotalCount: 15,
      nextStep: null,
    });

    expect(summary).toMatchObject({
      clientPreviewReady: true,
      readyCount: 2,
      blockedCount: 0,
      reviewCount: 0,
      totalCount: 2,
      codexProductReady: true,
      externalProductBlockerCount: 0,
      launchPacketReadyCount: 15,
      launchPacketTotalCount: 15,
    });
    expect(summary.ownerReadiness).toEqual([
      { owner: 'codex', ready: true, readyCount: 1, blockedCount: 0, reviewCount: 0, totalCount: 1 },
      { owner: 'deployment', ready: true, readyCount: 1, blockedCount: 0, reviewCount: 0, totalCount: 1 },
    ]);
  });

  it('keeps client preview blocked when any product requirement is blocked or packet proof is missing', () => {
    const summary = summarizeClientPreviewChecklist([
      baseItems[0]!,
      {
        ...baseItems[1]!,
        status: 'blocked',
      },
    ], {
      launchClientPreviewReady: true,
      matcherReceiptReady: true,
      launchPacketReadyCount: 9,
      launchPacketTotalCount: 15,
      nextStep: {
        key: 'operator-account',
        label: 'Operator account settings',
        owner: 'operator',
        nextAction: 'Run npm run operator:packet.',
        executionBoundary: 'Operator-owned external setup.',
        requiredInputs: ['Monitored support email address'],
        proofArtifacts: ['data/operator-setup-packet.md'],
        commands: ['npm run operator:packet'],
      },
    });

    expect(summary.clientPreviewReady).toBe(false);
    expect(summary.blockedCount).toBe(1);
    expect(summary.codexProductReady).toBe(true);
    expect(summary.externalProductBlockerCount).toBe(1);
    expect(summary.ownerReadiness.find((row) => row.owner === 'deployment')).toMatchObject({
      ready: false,
      blockedCount: 1,
    });
    expect(summary.nextStep?.label).toBe('Operator account settings');
    expect(summary.nextStep?.executionBoundary).toContain('Operator-owned');
    expect(summary.nextStep?.requiredInputs).toContain('Monitored support email address');
    expect(summary.nextStep?.proofArtifacts).toContain('data/operator-setup-packet.md');
  });

  it('reads Kimi visual packet coverage for client-preview evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-kimi-evidence-'));
    try {
      fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      fs.writeFileSync(path.join(root, 'data/kimi-visual-readiness-packet.json'), `${JSON.stringify({
        readiness: {
          ready: true,
          routeCount: 25,
          viewportCount: 2,
          screenshotCount: 50,
          checkCount: 50,
          failureCount: 0,
        },
        dynamicRouteDiscovery: {
          notes: [
            'visualDatabase=temporary-copy',
            'visualClaimSeed=temporary:/claims/1',
            'settlementDetail=checked:/settlements/1',
            'claimDetail=checked:/claims/1',
          ],
        },
      })}\n`);

      expect(readKimiVisualPacketEvidence(root)).toEqual({
        ready: true,
        routeCount: 25,
        viewportCount: 2,
        screenshotCount: 50,
        checkCount: 50,
        failureCount: 0,
        dynamicNotes: [
          'visualDatabase=temporary-copy',
          'visualClaimSeed=temporary:/claims/1',
          'settlementDetail=checked:/settlements/1',
          'claimDetail=checked:/claims/1',
        ],
        dynamicClaimDetailChecked: true,
        dynamicSettlementDetailChecked: true,
        temporaryVisualDatabase: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags helper exports from Next route files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-route-exports-'));
    try {
      const routeDir = path.join(root, 'src/app/api/demo');
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(path.join(routeDir, 'route.ts'), [
        "export const dynamic = 'force-dynamic';",
        'export async function GET() { return Response.json({ ok: true }); }',
        'export type DemoHelper = { ok: boolean };',
        'export function helper() { return true; }',
      ].join('\n'));

      expect(findRouteExportHygieneLeaks(root)).toEqual({
        routeFiles: ['src/app/api/demo/route.ts'],
        leaks: [
          'src/app/api/demo/route.ts:3: non-route export',
          'src/app/api/demo/route.ts:4: helper',
        ],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires the smoke test to guard rendered customer-page HTML', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-customer-copy-guard-'));
    try {
      const scriptsDir = path.join(root, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      const guardedSmokeWebapp = [
        'const customerCopyGuardedPaths = new Set();',
        'const forbiddenCustomerCopyText = [];',
        'const forbiddenCustomerHtmlText = [',
        "  'CLAIMBOT_',",
        "  'DATABASE_URL',",
        "  '/api/audit',",
        "  'Codex can',",
        "  'execution boundary',",
        "  'operator-owned',",
        "  'business-owned',",
        "  'deployment-owned',",
        "  'legal-owned',",
        "  'operator gate',",
        "  'business gate',",
        "  'deployment gate',",
        "  'legal gate',",
        "  'Hosted data gate',",
        "  'Business setup gate',",
        "  'Automation processing gate',",
        "  'Paid entitlement gate',",
        "  'Hosted preview gate',",
        "  'hosted setup',",
        "  'source setup needed',",
        "  'source setup required',",
        "  'source setup issue',",
        "  'setup mode',",
        "  'launch setup issue',",
        "  'complete launch source setup',",
        "  'setup readiness',",
        "  'setup status',",
        "  'setup locks',",
        "  'Setup boundary',",
        "  'readiness files',",
        "  'raw files',",
        "  'raw records',",
        "  'export files',",
        "  'internal records',",
        "  'internal readiness details',",
        "  'internal detail',",
        "  'internally clear',",
        "  'readiness records',",
        "  'readiness record',",
        "  'readiness evidence',",
        "  'full launch records',",
        "  'technical readiness details',",
        "  'detailed readiness records',",
        "  'advanced workspace details',",
        "  'advanced pricing readiness',",
        "  'advanced readiness view',",
        "  'owner readiness summary',",
        "  'owner view',",
        "  'launch reviewer',",
        "  'backend details',",
        "  'technical readiness status',",
        "  'backend',",
        "  'server-side',",
        "  'CLAIM_QUEUE_BLOCKED',",
        "  'claim_queue_blocked',",
        "  'server checks',",
        "  'server check',",
        "  'Backend release evidence',",
        "  'backend release evidence',",
        "  'Backend tracking check',",
        "  'backend tracking check',",
        "  'Blocked-at-server receipt',",
        "  'blocked-at-server receipt',",
        "  'An owner can',",
        "  'an owner can',",
        "  'Deployment switches',",
        "  'deployment switches',",
        "  'handled by an administrator',",
        "  'setup files',",
        "  'raw setup files',",
        "  'setup artifact',",
        "  'setup artifacts',",
        "  'setup evidence',",
        "  'Support setup pending',",
        "  'setup items left',",
        "  'setup-backed',",
        "  'active blockers',",
        "  'blockers remain',",
        "  'Access blocked',",
        "  'Customer access: blocked',",
        "  'No external setup blocker',",
        "  'Hands-off paid filing still blocked',",
        "  'setup blocker',",
        "  'business setup still',",
        "  'client invites',",
        "  'identity setup',",
        "  'identity facts',",
        "  'identity and contact',",
        "  'open identity',",
        "  'review identity',",
        "  'identity is ready',",
        "  'identity is not available',",
        "  'identity not ready',",
        "  'Netlify',",
        "  'auth token',",
        "  'billing secret',",
        "  'webhook secret',",
        "  'plan gate',",
        "  'permission gate',",
        "  'safety gates',",
        "  'gate filter',",
        "  'every gate',",
        "  'filing gates',",
        "  'automation remains gated',",
        "  'paid billing gates',",
        "  'required gates',",
        "  'pre-invite auth gate',",
        "  'manual approval gate',",
        "  'gated automation',",
        "  'bypass gates',",
        "  'gate used for review',",
        "  'gate between',",
        "  'paid automation gate',",
        "  'gates pass',",
        "  'gates clear',",
        "  'plan-gated',",
        "  'claim gates',",
        "  'operator proof',",
        "  'operator-proof-note',",
        "  'contact-operator-drawer',",
        "  'profile-advanced-drawer',",
        "  'operator-only commands',",
        "  'launch-console',",
        "  'proof artifact paths',",
        "  'command surface',",
        "  'environment variables',",
        "  'support packets',",
        "  'client handoff',",
        "  'inviting clients',",
        "  'before inviting clients',",
        "  'inviting customers',",
        "  'before inviting customers',",
        "  'first client run',",
        "  'client deployment',",
        "  'client questions',",
        "  'client-ready',",
        "  'client workspace',",
        "  'client scope',",
        "  'client portal',",
        "  'clients can',",
        "  'clients inspect',",
        "  'Netlify CLI',",
        "  'SMOKE_BASE_URL',",
        "  'Operator account settings',",
        "  'Netlify Identity proof',",
        "  'netlify-identity-proof',",
        "  'data/worker-runtime-packet.md',",
        "  'data/billing-activation-packet.md',",
        "  'data/preview-promotion-packet.md',",
        '];',
        'const pageHtml = await page.content();',
        "failures.push('customer page serializes internal copy');",
      ].join('\n');

      fs.writeFileSync(path.join(scriptsDir, 'smoke-webapp.cjs'), guardedSmokeWebapp);

      expect(hasCustomerRenderedCopyGuard(root)).toBe(true);

      fs.writeFileSync(path.join(scriptsDir, 'smoke-webapp.cjs'), guardedSmokeWebapp.replace("  'plan gate',\n", ''));

      expect(hasCustomerRenderedCopyGuard(root)).toBe(false);

      fs.writeFileSync(path.join(scriptsDir, 'smoke-webapp.cjs'), [
        'const customerCopyGuardedPaths = new Set();',
        'const forbiddenCustomerCopyText = [];',
      ].join('\n'));

      expect(hasCustomerRenderedCopyGuard(root)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
