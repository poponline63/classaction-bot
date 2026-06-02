import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasNetlifyCspHeader,
  hasNetlifyHostedBuildConfig,
  hasNetlifyPwaHeaders,
  hasNetlifySecurityHeaders,
  isCspEnforcedForHostedReadiness,
} from '../../src/lib/deployment-security';

function withEnv(env: Record<string, string | undefined>, callback: () => void) {
  const previous = {
    NETLIFY: process.env.NETLIFY,
    CLAIMBOT_ENFORCE_CSP: process.env.CLAIMBOT_ENFORCE_CSP,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('deployment security config', () => {
  it('detects a Netlify CSP header with frame ancestor protection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claimbot-security-'));
    const file = join(dir, 'netlify.toml');

    writeFileSync(
      file,
      `
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; frame-ancestors 'none'"
`,
    );

    try {
      expect(hasNetlifyCspHeader(file)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects partial CSP evidence without frame ancestor protection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claimbot-security-'));
    const file = join(dir, 'netlify.toml');

    writeFileSync(
      file,
      `
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'"
`,
    );

    try {
      expect(hasNetlifyCspHeader(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('confirms the committed Netlify config has hosted build, security, and PWA headers', () => {
    expect(hasNetlifyHostedBuildConfig()).toBe(true);
    expect(hasNetlifySecurityHeaders()).toBe(true);
    expect(hasNetlifyPwaHeaders()).toBe(true);
  });

  it('rejects a Netlify config that omits the hosted build command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claimbot-security-'));
    const file = join(dir, 'netlify.toml');

    writeFileSync(
      file,
      `
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
  NEXT_TELEMETRY_DISABLED = "1"
`,
    );

    try {
      expect(hasNetlifyHostedBuildConfig(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a Netlify config missing PWA static headers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claimbot-security-'));
    const file = join(dir, 'netlify.toml');

    writeFileSync(
      file,
      `
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; frame-ancestors 'none'; object-src 'none'"
`,
    );

    try {
      expect(hasNetlifyPwaHeaders(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not treat committed Netlify headers as active on non-Netlify hosts', () => {
    withEnv({ NETLIFY: undefined, CLAIMBOT_ENFORCE_CSP: undefined }, () => {
      expect(hasNetlifySecurityHeaders()).toBe(true);
      expect(isCspEnforcedForHostedReadiness()).toBe(false);
    });
  });

  it('accepts explicit CSP enforcement on non-Netlify hosts', () => {
    withEnv({ NETLIFY: undefined, CLAIMBOT_ENFORCE_CSP: 'true' }, () => {
      expect(isCspEnforcedForHostedReadiness()).toBe(true);
    });
  });

  it('accepts Netlify CSP readiness only when committed security headers are present', () => {
    withEnv({ NETLIFY: 'true', CLAIMBOT_ENFORCE_CSP: undefined }, () => {
      expect(isCspEnforcedForHostedReadiness()).toBe(true);
    });
  });
});
