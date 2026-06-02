import fs from 'node:fs';
import path from 'node:path';

const jsonPath = 'data/netlify-launch-doctor.json';
const markdownPath = 'data/netlify-launch-doctor.md';

function blockedCheckAlreadyCovered(check: string, blockers: string[]) {
  const label = check.split(':', 1)[0]?.toLowerCase() ?? check.toLowerCase();
  const blockerText = blockers.join('\n').toLowerCase();

  if (blockerText.includes(label)) return true;
  if (label.includes('netlify authentication') && blockerText.includes('not authenticated')) return true;
  if (label.includes('deployed preview url') && blockerText.includes('smoke_base_url is not a deployed https preview url')) return true;
  if (label.includes('preview site alignment') && blockerText.includes('does not belong to confirmed netlify site slug')) return true;

  return false;
}

export function buildNetlifyLaunchDoctorExport(root = process.cwd()) {
  const absoluteJsonPath = path.join(root, jsonPath);
  const absoluteMarkdownPath = path.join(root, markdownPath);
  const exportedAt = new Date().toISOString();

  if (!fs.existsSync(absoluteJsonPath)) {
    return {
      format: 'claimbot.netlify-launch-doctor-export.v1',
      exportedAt,
      artifact: markdownPath,
      sourceJson: jsonPath,
      exists: false,
      ready: false,
      receipt: null,
      missingInputs: [
        'Run npm run netlify:doctor to create the non-secret Netlify launch doctor receipt.',
      ],
      boundary: 'This export is authenticated, no-store, and non-secret. It only returns the saved Netlify doctor receipt; it does not run Netlify CLI commands from the hosted app.',
    };
  }

  try {
    const receipt = JSON.parse(fs.readFileSync(absoluteJsonPath, 'utf8')) as {
      format?: unknown;
      generatedAt?: unknown;
      ready?: unknown;
      blockedChecks?: unknown;
      blockers?: unknown;
      warnings?: unknown;
      readiness?: unknown;
    };
    const markdownExists = fs.existsSync(absoluteMarkdownPath);
    const blockers = Array.isArray(receipt.blockers)
      ? receipt.blockers.filter((item): item is string => typeof item === 'string')
      : [];
    const blockedChecks = Array.isArray(receipt.blockedChecks)
      ? receipt.blockedChecks
        .filter((item): item is { label?: string; detail?: string } => item && typeof item === 'object')
        .map((item) => {
          const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Blocked Netlify check';
          const detail = typeof item.detail === 'string' && item.detail.trim() ? item.detail.trim() : 'No detail recorded.';
          return `${label}: ${detail}`;
        })
      : [];
    const missingInputs = [
      ...blockers,
      ...blockedChecks.filter((item) => !blockedCheckAlreadyCovered(item, blockers)),
    ];
    const warnings = Array.isArray(receipt.warnings)
      ? receipt.warnings.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      format: 'claimbot.netlify-launch-doctor-export.v1',
      exportedAt,
      artifact: markdownPath,
      sourceJson: jsonPath,
      exists: true,
      markdownExists,
      ready: receipt.ready === true,
      receipt,
      missingInputs,
      blockedChecks,
      warnings,
      readiness: receipt.readiness ?? null,
      boundary: 'This export is authenticated, no-store, and non-secret. It exposes the saved Netlify CLI/auth, hosted env, preview target, and Identity receipt status without printing tokens, database URLs, checkout URLs, or raw environment values.',
    };
  } catch {
    return {
      format: 'claimbot.netlify-launch-doctor-export.v1',
      exportedAt,
      artifact: markdownPath,
      sourceJson: jsonPath,
      exists: true,
      ready: false,
      receipt: null,
      missingInputs: [
        'Regenerate the Netlify launch doctor receipt; the saved JSON could not be parsed.',
      ],
      boundary: 'This export is authenticated, no-store, and non-secret. It only returns the saved Netlify doctor receipt; it does not run Netlify CLI commands from the hosted app.',
    };
  }
}

export type NetlifyLaunchDoctorExport = ReturnType<typeof buildNetlifyLaunchDoctorExport>;
