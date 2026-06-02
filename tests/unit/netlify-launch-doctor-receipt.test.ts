import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildNetlifyLaunchDoctorExport } from '../../src/lib/netlify-launch-doctor-receipt';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-doctor-export-'));
}

function writeDoctor(root: string, value: unknown) {
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'netlify-launch-doctor.json'), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'netlify-launch-doctor.md'), '# Netlify doctor\n');
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('buildNetlifyLaunchDoctorExport', () => {
  it('exports blocked check details as missing inputs for operator handoff', () => {
    const root = makeTempRoot();
    roots.push(root);
    writeDoctor(root, {
      format: 'claimbot.netlify-launch-doctor.v1',
      generatedAt: '2026-06-01T00:00:00.000Z',
      ready: false,
      blockers: ['SMOKE_BASE_URL is not a deployed HTTPS preview URL.'],
      blockedChecks: [
        { label: 'Deployed preview URL', detail: 'deploy a preview and set SMOKE_BASE_URL' },
        { label: 'Identity setup receipt', detail: 'confirm Identity dashboard settings, then run npm run netlify:record-setup' },
      ],
      warnings: [],
      readiness: { deployedPreviewUrlReady: false, identityReceiptReady: false },
    });

    const result = buildNetlifyLaunchDoctorExport(root);

    expect(result.ready).toBe(false);
    expect(result.missingInputs).toEqual(expect.arrayContaining([
      'SMOKE_BASE_URL is not a deployed HTTPS preview URL.',
      'Identity setup receipt: confirm Identity dashboard settings, then run npm run netlify:record-setup',
    ]));
    expect(result.missingInputs).not.toContain('Deployed preview URL: deploy a preview and set SMOKE_BASE_URL');
    expect(result.blockedChecks).toEqual(expect.arrayContaining([
      'Identity setup receipt: confirm Identity dashboard settings, then run npm run netlify:record-setup',
    ]));
  });
});
