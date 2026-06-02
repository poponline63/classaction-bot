import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'deployability-packet.json');
const markdownPath = path.join(outputDir, 'deployability-packet.md');

const sourceFiles = [
  'package.json',
  'next.config.mjs',
  'netlify.toml',
  'scripts/validate-secret-hygiene.cjs',
  'scripts/validate-netlify-preflight.cjs',
  'scripts/smoke-webapp.cjs',
  'scripts/smoke-hosted-auth.cjs',
  'scripts/smoke-feature-flags.cjs',
];

function runCheck(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdoutTail: (result.stdout || '').split(/\r?\n/).filter(Boolean).slice(-8),
    stderrTail: (result.stderr || '').split(/\r?\n/).filter(Boolean).slice(-8),
  };
}

function fileEvidence(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      bytes: 0,
      modifiedAt: null,
    };
  }

  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function textIncludes(relativePath: string, needle: string) {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').includes(needle);
  } catch {
    return false;
  }
}

function resolveBuildArtifactDir() {
  const configured = process.env.CLAIMBOT_DEPLOY_DIST_DIR || process.env.NEXT_DIST_DIR;
  if (configured) return configured;
  if (fs.existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) return '.next';
  if (fs.existsSync(path.join(process.cwd(), '.next-smoke-deploy', 'BUILD_ID'))) return '.next-smoke-deploy';
  return '.next';
}

function main() {
  const generatedAt = new Date().toISOString();
  const secretHygiene = runCheck('npm', ['run', 'validate:secrets']);
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const buildArtifactDir = resolveBuildArtifactDir();
  const buildReceipt = fileEvidence(`${buildArtifactDir}/BUILD_ID`);
  const routesManifest = fileEvidence(`${buildArtifactDir}/routes-manifest.json`);
  const buildManifest = fileEvidence(`${buildArtifactDir}/build-manifest.json`);
  const netlifyTomlReady = textIncludes('netlify.toml', 'command = "npm run build:hosted"')
    && textIncludes('netlify.toml', 'publish = ".next"');
  const buildScriptsReady = packageJson.scripts?.build === 'next build'
    && Boolean(packageJson.scripts?.['build:hosted']?.includes('validate:secrets'))
    && Boolean(packageJson.scripts?.['build:hosted']?.includes('validate:pwa'))
    && (
      Boolean(packageJson.scripts?.['build:hosted']?.includes('next build'))
      || Boolean(packageJson.scripts?.['build:hosted']?.includes('npm run build'))
    );
  const nextBuildArtifactsReady = buildReceipt.exists && routesManifest.exists && buildManifest.exists;
  const ready = secretHygiene.ok && buildScriptsReady && netlifyTomlReady && nextBuildArtifactsReady;

  const packet = {
    format: 'claimbot.deployability-packet.v1',
    generatedAt,
    note: 'Non-secret deployability packet. This packet records build, script, Netlify, and secret-hygiene readiness without writing API keys, env values, database URLs, session secrets, billing secrets, tokens, or user data.',
    readiness: {
      ready,
      secretHygieneOk: secretHygiene.ok,
      buildScriptsReady,
      netlifyTomlReady,
      nextBuildArtifactsReady,
      buildArtifactDir,
      buildReceipt,
      routesManifest,
      buildManifest,
      requiredForClientPreview: true,
      note: 'A local production build artifact is not a deployed preview receipt. It proves the current workspace can produce Next.js build output after secret hygiene passes.',
    },
    checks: {
      secretHygiene,
    },
    sourceEvidence: sourceFiles.map(fileEvidence),
    commands: [
      'npm run validate:secrets',
      'npm run typecheck',
      '$env:NEXT_DIST_DIR=".next-smoke-deploy"; npm run build',
      '$env:CLAIMBOT_DEPLOY_DIST_DIR=".next-smoke-deploy"; npm run deploy:packet',
      'npm run deploy:packet',
      'npm run build:hosted',
      '# After Netlify preview exists:',
      'npm run validate:netlify:strict',
      'npm run preview:gate',
    ],
  };

  const markdown = [
    '# ClaimBot Deployability Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret deployability packet. It does not contain API keys, env values, database URLs, session secrets, billing secrets, tokens, or user data.',
    '',
    '## Current Gate',
    '',
    `Deployability packet ready: ${ready ? 'yes' : 'no'}`,
    `Secret hygiene: ${secretHygiene.ok ? 'pass' : 'fail'}`,
    `Build scripts: ${buildScriptsReady ? 'ready' : 'blocked'}`,
    `Netlify build config: ${netlifyTomlReady ? 'ready' : 'blocked'}`,
    `Build artifact dir: ${buildArtifactDir}`,
    `Next build artifacts: ${nextBuildArtifactsReady ? 'present' : 'missing'}`,
    `Build receipt: ${buildReceipt.exists ? `${buildReceipt.path}, ${buildReceipt.modifiedAt}` : 'missing'}`,
    `Boundary: ${packet.readiness.note}`,
    '',
    '## Secret Hygiene Check',
    '',
    `Command: ${secretHygiene.command}`,
    `Status: ${secretHygiene.ok ? 'pass' : 'fail'}`,
    ...(secretHygiene.stdoutTail.length > 0 ? secretHygiene.stdoutTail.map((line) => `- ${line}`) : ['- No stdout recorded']),
    ...(secretHygiene.stderrTail.length > 0 ? secretHygiene.stderrTail.map((line) => `- stderr: ${line}`) : []),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[deployability-packet] wrote non-secret deployability packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Deployability ready: ${ready ? 'yes' : 'no'}`);
  console.log(`Secret hygiene: ${secretHygiene.ok ? 'pass' : 'fail'}`);
  console.log(`Next build artifacts: ${nextBuildArtifactsReady ? 'present' : 'missing'}`);
}

main();
