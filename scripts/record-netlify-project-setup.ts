import fs from 'node:fs';
import path from 'node:path';
import {
  NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
  expectedSafeNetlifyEnvKeys,
  type NetlifyProjectSetupReceipt,
} from '../src/lib/netlify-project-setup-receipt';

type Args = {
  identityEnabled: boolean;
  emailConfirmation: boolean;
  registration: 'invite-only' | 'open' | 'unknown';
  evidence: string;
  safeEnvConfirmed: boolean;
};

const root = process.cwd();
const receiptPath = path.join(root, 'data', 'netlify-project-setup-receipt.json');

function hasTemplatePlaceholder(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return true;
  return (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    identityEnabled: false,
    emailConfirmation: false,
    registration: 'unknown',
    evidence: '',
    safeEnvConfirmed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--identity-enabled') {
      args.identityEnabled = true;
      continue;
    }
    if (arg === '--email-confirmation') {
      args.emailConfirmation = true;
      continue;
    }
    if (arg === '--safe-env-confirmed') {
      args.safeEnvConfirmed = true;
      continue;
    }
    if (arg === '--registration') {
      const value = argv[index + 1];
      if (!['invite-only', 'open', 'unknown'].includes(value ?? '')) {
        throw new Error('--registration must be invite-only, open, or unknown.');
      }
      args.registration = value as Args['registration'];
      index += 1;
      continue;
    }
    if (arg === '--evidence') {
      args.evidence = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function validateIdentityProofArgs(args: Args) {
  if (!args.identityEnabled) return;

  const evidence = args.evidence.trim();
  const normalizedEvidence = evidence.toLowerCase();
  const missing: string[] = [];

  if (args.registration !== 'invite-only') {
    missing.push('--registration invite-only');
  }
  if (!args.emailConfirmation) {
    missing.push('--email-confirmation');
  }
  if (!hasValue(evidence) || evidence.length < 48) {
    missing.push('--evidence with a dashboard-specific Identity confirmation');
  }
  if (!normalizedEvidence.includes('identity')) {
    missing.push('evidence mentions Identity');
  }
  if (!normalizedEvidence.includes('dashboard') && !normalizedEvidence.includes('project configuration')) {
    missing.push('evidence mentions the Netlify dashboard or Project configuration');
  }
  if (!normalizedEvidence.includes('invite')) {
    missing.push('evidence mentions invite-only registration');
  }
  if (!normalizedEvidence.includes('email')) {
    missing.push('evidence mentions email confirmation');
  }

  if (missing.length > 0) {
    throw new Error(`Identity proof is incomplete. Required: ${missing.join(', ')}.`);
  }
}

function readJsonIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseEnvFile(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  const values: Record<string, string> = {};
  if (!fs.existsSync(fullPath)) return values;

  for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }

  return values;
}

function mergedSafeEnv() {
  return {
    ...parseEnvFile('.env.hosted.local'),
    ...process.env,
  };
}

function slugFromDashboardUrl(value: string | undefined) {
  if (!hasValue(value)) return '';
  try {
    const url = new URL(value!);
    const parts = url.pathname.split('/').filter(Boolean);
    const sitesIndex = parts.indexOf('sites');
    const projectsIndex = parts.indexOf('projects');
    if (sitesIndex >= 0) return parts[sitesIndex + 1] ?? '';
    if (projectsIndex >= 0) return parts[projectsIndex + 1] ?? '';
    return '';
  } catch {
    return '';
  }
}

function requireSiteMetadata() {
  const state = readJsonIfExists(path.join(root, '.netlify', 'state.json'));
  const env = mergedSafeEnv();
  const stateSiteId = typeof state.siteId === 'string' ? state.siteId.trim() : '';
  const stateSiteName = typeof state.siteName === 'string' ? state.siteName.trim() : '';
  const stateAdminUrl = typeof state.adminUrl === 'string' ? state.adminUrl.trim() : '';
  const siteId = (env.NETLIFY_SITE_ID || env.SITE_ID || stateSiteId || '').trim();
  const dashboardUrl = (env.NETLIFY_SITE_DASHBOARD_URL || stateAdminUrl || '').trim();
  const siteName = (env.NETLIFY_SITE_SLUG || stateSiteName || slugFromDashboardUrl(dashboardUrl) || '').trim();

  const missing: string[] = [];
  if (!hasValue(siteId)) missing.push('NETLIFY_SITE_ID/SITE_ID or .netlify/state.json siteId');
  if (!hasValue(siteName)) missing.push('NETLIFY_SITE_SLUG or .netlify/state.json siteName');
  if (!hasValue(dashboardUrl)) missing.push('NETLIFY_SITE_DASHBOARD_URL or .netlify/state.json adminUrl');
  if (missing.length > 0) {
    throw new Error(`Missing confirmed Netlify site metadata: ${missing.join(', ')}. Run netlify link or set the non-secret site target values first.`);
  }

  return { siteId, siteName, dashboardUrl };
}

function configuredSafeEnvKeys(safeEnvConfirmed: boolean) {
  if (safeEnvConfirmed) return [...expectedSafeNetlifyEnvKeys];
  const env = mergedSafeEnv();
  return expectedSafeNetlifyEnvKeys.filter((key) => hasValue(env[key]));
}

function buildIdentity(args: Args): NetlifyProjectSetupReceipt['identity'] {
  return {
    enabled: args.identityEnabled,
    registration: args.registration,
    emailConfirmation: args.emailConfirmation,
    verifiedAt: new Date().toISOString(),
    evidence: args.evidence || 'Operator-confirmed Netlify dashboard Identity settings.',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  validateIdentityProofArgs(args);
  const site = requireSiteMetadata();
  const receipt: NetlifyProjectSetupReceipt = {
    format: NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
    generatedAt: new Date().toISOString(),
    siteId: site.siteId,
    siteName: site.siteName,
    dashboardUrl: site.dashboardUrl,
    configuredSafeEnvKeys: configuredSafeEnvKeys(args.safeEnvConfirmed),
    identity: buildIdentity(args),
    notes: [
      'This non-secret receipt records operator-confirmed Netlify project setup. It does not contain database tokens, session secrets, billing secrets, checkout URLs, user data, or legal approval.',
      'Identity readiness still must be proved by deployed preview auth smoke before production promotion.',
    ],
  };

  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log('[netlify-project-setup] wrote non-secret setup receipt');
  console.log(`Receipt: ${path.relative(root, receiptPath)}`);
  console.log(`Project: ${receipt.siteName}`);
  console.log(`Identity proof: ${receipt.identity?.enabled ? receipt.identity.registration : 'not enabled'}`);
  console.log(`Safe env defaults recorded: ${receipt.configuredSafeEnvKeys.length}/${expectedSafeNetlifyEnvKeys.length}`);
  console.log('No secret values were printed.');
}

try {
  main();
} catch (error) {
  console.error('[netlify-project-setup] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
