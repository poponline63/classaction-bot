const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const workflowPath = path.join(root, '.github', 'workflows', 'claimbot-worker.yml');
const packagePath = path.join(root, 'package.json');
const outputDir = path.join(root, 'data');
const jsonPath = path.join(outputDir, 'github-worker-doctor.json');
const markdownPath = path.join(outputDir, 'github-worker-doctor.md');
const checks = [];

const requiredWorkflowText = [
  'name: ClaimBot paid automation worker',
  'seed_smoke_job',
  'SMOKE_BASE_URL is required when seed_smoke_job=true',
  'SMOKE_BASE_URL must be an HTTPS deployed preview URL',
  'claimbot-worker-file-claim-smoke-seed',
  'claimbot-worker-smoke-receipt',
  'claimbot-worker-runtime-packet',
  'npm run worker:once',
  'npm run worker:packet',
  'if: ${{ always() }}',
];

const requiredSecretNames = [
  'DATABASE_URL',
];

const conditionalSecretNames = [
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
];

const requiredVariableNames = [
  'SMOKE_BASE_URL',
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_MAX_PER_DAY',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_SUPPORT_EMAIL',
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

function hasCommand(command) {
  const probe = run(command, ['--version']);
  return probe.status === 0;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function listNames(kind) {
  const result = run('gh', [kind, 'list', '--json', 'name']);
  if (result.status !== 0) {
    return {
      ok: false,
      names: [],
      detail: result.stderr.trim().split(/\r?\n/).slice(-1)[0] || `${kind} list failed`,
    };
  }
  const parsed = parseJson(result.stdout);
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      names: [],
      detail: `${kind} list did not return JSON`,
    };
  }
  return {
    ok: true,
    names: parsed.map((item) => item?.name).filter((name) => typeof name === 'string'),
    detail: `${parsed.length} ${kind}${parsed.length === 1 ? '' : 's'} visible by name`,
  };
}

function statusLine(pass, label, detail) {
  checks.push({
    label,
    status: pass ? 'pass' : 'fail',
    detail,
  });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
}

function warnLine(label, detail) {
  checks.push({
    label,
    status: 'warn',
    detail,
  });
  console.log(`WARN ${label}: ${detail}`);
}

function writeReceipt(packet) {
  const markdown = [
    '# ClaimBot GitHub Worker Doctor',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret GitHub worker readiness receipt. It records local workflow checks, GitHub CLI/auth status, visible secret/variable names, and next commands only; it does not print secret values.',
    '',
    '## Current Gate',
    '',
    `Ready: ${packet.ready ? 'yes' : 'no'}`,
    `Failures: ${packet.failures.length}`,
    `Warnings: ${packet.warnings.length}`,
    '',
    '## Checks',
    '',
    ...packet.checks.map((check) => `- ${check.status.toUpperCase()} ${check.label}: ${check.detail}`),
    '',
    '## Failures',
    '',
    ...(packet.failures.length === 0 ? ['- none'] : packet.failures.map((item) => `- ${item}`)),
    '',
    '## Warnings',
    '',
    ...(packet.warnings.length === 0 ? ['- none'] : packet.warnings.map((item) => `- ${item}`)),
    '',
    '## Next Commands',
    '',
    ...packet.nextCommands.map((command) => `- \`${command}\``),
    '',
    'No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);
}

function main() {
  const failures = [];
  const warnings = [];
  const workflowText = readIfExists(workflowPath);
  const packageText = readIfExists(packagePath);

  console.log('ClaimBot GitHub worker doctor');
  console.log('No secret values are printed. GitHub checks read names/status only.');
  console.log('');

  const workflowExists = workflowText.length > 0;
  statusLine(workflowExists, 'Workflow file', workflowExists ? '.github/workflows/claimbot-worker.yml exists' : 'workflow file is missing');
  if (!workflowExists) failures.push('Create .github/workflows/claimbot-worker.yml before configuring the scheduled worker.');

  for (const text of requiredWorkflowText) {
    const present = workflowText.includes(text);
    statusLine(present, `Workflow guard ${text}`, present ? 'present' : 'missing');
    if (!present) failures.push(`Workflow file is missing required text: ${text}`);
  }

  const workerScriptsReady = packageText.includes('"worker:once"')
    && packageText.includes('"worker:file-claim:seed"')
    && packageText.includes('"worker:packet"');
  statusLine(workerScriptsReady, 'Worker npm scripts', workerScriptsReady ? 'worker:once, worker:file-claim:seed, and worker:packet are present' : 'required worker scripts are missing');
  if (!workerScriptsReady) failures.push('package.json must expose worker:once, worker:file-claim:seed, and worker:packet.');

  const ghInstalled = hasCommand('gh');
  statusLine(ghInstalled, 'GitHub CLI', ghInstalled ? 'gh is installed' : 'gh is not installed or not on PATH');
  if (!ghInstalled) {
    failures.push('Install GitHub CLI and run gh auth login before configuring the scheduled worker.');
  }

  let ghAuthenticated = false;
  if (ghInstalled) {
    const auth = run('gh', ['auth', 'status']);
    ghAuthenticated = auth.status === 0;
    statusLine(ghAuthenticated, 'GitHub auth', ghAuthenticated ? 'gh auth status succeeded' : 'gh auth status failed');
    if (!ghAuthenticated) failures.push('Run gh auth login for the GitHub account that owns the ClaimBot repository.');

    const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner']);
    const repoJson = repo.status === 0 ? parseJson(repo.stdout) : null;
    const repoVisible = Boolean(repoJson?.nameWithOwner);
    statusLine(repoVisible, 'GitHub repository', repoVisible ? `repo visible as ${repoJson.nameWithOwner}` : 'gh repo view failed in this workspace');
    if (!repoVisible) failures.push('Run this doctor inside the ClaimBot GitHub repository or set GH_REPO to the correct owner/repo.');

    const workflow = run('gh', ['workflow', 'view', 'claimbot-worker.yml']);
    const workflowVisible = workflow.status === 0;
    if (workflowVisible) {
      statusLine(true, 'Remote worker workflow', 'claimbot-worker.yml is visible to GitHub CLI');
    } else {
      warnLine('Remote worker workflow', 'claimbot-worker.yml is not visible remotely yet');
    }
    if (!workflowVisible) warnings.push('Push the branch or confirm the workflow exists on GitHub before running gh workflow run claimbot-worker.yml.');

    const secretList = listNames('secret');
    statusLine(secretList.ok, 'GitHub secret names', secretList.detail);
    if (secretList.ok) {
      for (const name of requiredSecretNames) {
        const present = secretList.names.includes(name);
        statusLine(present, `Required secret ${name}`, present ? 'name exists' : 'name missing');
        if (!present) failures.push(`GitHub secret ${name} is required for the scheduled worker.`);
      }
      const hasAnyDbAuth = secretList.names.includes('DATABASE_AUTH_TOKEN') || secretList.names.includes('TURSO_AUTH_TOKEN');
      if (hasAnyDbAuth) {
        statusLine(true, 'Database auth token secret', 'DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN name exists');
      } else {
        warnLine('Database auth token secret', 'needed when DATABASE_URL is libsql://');
      }
      if (!hasAnyDbAuth) warnings.push('Set DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN if the hosted DATABASE_URL is libsql://.');
      for (const name of conditionalSecretNames.filter((item) => !['DATABASE_AUTH_TOKEN', 'TURSO_AUTH_TOKEN'].includes(item))) {
        if (!secretList.names.includes(name)) warnings.push(`Optional/conditional GitHub secret not visible by name: ${name}.`);
      }
    } else if (ghAuthenticated) {
      warnings.push('Could not list GitHub secret names; confirm DATABASE_URL and database auth token are configured before running the workflow.');
    }

    const variableList = listNames('variable');
    statusLine(variableList.ok, 'GitHub variable names', variableList.detail);
    if (variableList.ok) {
      for (const name of requiredVariableNames) {
        const present = variableList.names.includes(name);
        statusLine(present, `Required variable ${name}`, present ? 'name exists' : 'name missing');
        if (!present) failures.push(`GitHub variable ${name} is required for worker smoke proof.`);
      }
    } else if (ghAuthenticated) {
      warnings.push('Could not list GitHub variable names; confirm SMOKE_BASE_URL and worker posture variables before running seed_smoke_job=true.');
    }
  }

  console.log('');
  console.log(`Failures: ${failures.length}`);
  for (const failure of failures) console.log(`- ${failure}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`- ${warning}`);
  console.log('');
  console.log('Next commands:');
  const nextCommands = [
    'npm run worker:packet',
    'gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"',
    'gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true',
  ];
  for (const command of nextCommands) console.log(command);

  const packet = {
    format: 'claimbot.github-worker-doctor.v1',
    generatedAt: new Date().toISOString(),
    ready: failures.length === 0,
    checks,
    failures,
    warnings,
    nextCommands,
    requiredSecrets: requiredSecretNames,
    conditionalSecrets: conditionalSecretNames,
    requiredVariables: requiredVariableNames,
    workflowPath: '.github/workflows/claimbot-worker.yml',
    boundary: 'This receipt verifies names/status only. It cannot prove secret values are correct and it cannot replace the hosted worker smoke artifact.',
  };
  writeReceipt(packet);
  console.log('');
  console.log(`Wrote non-secret receipt: ${path.relative(root, markdownPath)}`);

  if (failures.length > 0) process.exitCode = 1;
}

main();
