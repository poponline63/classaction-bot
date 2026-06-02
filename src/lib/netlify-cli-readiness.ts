import { spawnSync } from 'node:child_process';

export type NetlifyCliReadiness = {
  available: boolean;
  authenticated: boolean;
  version: string | null;
  items: Array<{
    key: 'netlify-cli' | 'netlify-auth';
    label: string;
    status: 'pass' | 'fail';
    detail: string;
    action: string;
  }>;
};

const CACHE_TTL_MS = 30_000;
let cachedReadiness: { checkedAt: number; value: NetlifyCliReadiness } | null = null;

function runNetlify(args: string[]) {
  return spawnSync('netlify', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 5000,
  });
}

export function evaluateNetlifyCliReadiness(): NetlifyCliReadiness {
  const now = Date.now();
  if (cachedReadiness && now - cachedReadiness.checkedAt < CACHE_TTL_MS) {
    return cachedReadiness.value;
  }

  const versionResult = runNetlify(['--version']);
  const available = versionResult.status === 0;
  const version = available ? versionResult.stdout.trim() : null;

  if (!available) {
    const value: NetlifyCliReadiness = {
      available,
      authenticated: false,
      version,
      items: [{
        key: 'netlify-cli',
        label: 'Netlify CLI',
        status: 'fail',
        detail: 'Netlify CLI is not available on this machine.',
        action: 'Install it with npm install -g netlify-cli, then run netlify --version.',
      }],
    };
    cachedReadiness = { checkedAt: now, value };
    return value;
  }

  const statusResult = runNetlify(['status']);
  const statusOutput = `${statusResult.stdout || ''}\n${statusResult.stderr || ''}`;
  const authenticated = statusResult.status === 0 && !/not logged in/i.test(statusOutput);

  const value: NetlifyCliReadiness = {
    available,
    authenticated,
    version,
    items: [
      {
        key: 'netlify-cli',
        label: 'Netlify CLI',
        status: 'pass',
        detail: `Netlify CLI is available${version ? ` (${version})` : ''}.`,
        action: 'Keep the CLI available for env push, preview deploy, and promotion commands.',
      },
      ...(authenticated ? [{
        key: 'netlify-auth' as const,
        label: 'Netlify authentication',
        status: 'pass' as const,
        detail: 'Netlify CLI is authenticated for operator deploy and env commands.',
        action: 'Rerun npm run netlify:doctor before preview deploy to confirm auth is still valid.',
      }] : [{
        key: 'netlify-auth' as const,
        label: 'Netlify authentication',
        status: 'fail' as const,
        detail: 'Netlify CLI is installed but not logged in on this machine.',
        action: 'Run netlify login, confirm netlify status, then rerun npm run netlify:doctor.',
      }]),
    ],
  };
  cachedReadiness = { checkedAt: now, value };
  return value;
}
