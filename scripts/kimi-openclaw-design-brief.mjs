import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const model = process.env.KIMI_OPENCLAW_MODEL || process.env.KIMI_MODEL || 'moonshot/kimi-k2.6';
const timeoutMs = Number(process.env.KIMI_TIMEOUT_MS ?? '180000');
const outFile = process.env.KIMI_DESIGN_OUT || path.join(root, 'docs', 'kimi-design-brief.md');

async function readExcerpt(file, maxChars) {
  try {
    const content = await fs.readFile(path.join(root, file), 'utf8');
    return content.slice(0, maxChars);
  } catch {
    return '';
  }
}

function redact(text) {
  return text.replace(/sk-[A-Za-z0-9_-]+|ak-[A-Za-z0-9_-]+|org-[A-Za-z0-9_-]+/g, '[redacted]');
}

function cleanContent(content) {
  return content
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function runOpenClaw(prompt) {
  return new Promise((resolve, reject) => {
    const windowsOpenClaw = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'openclaw.mjs');
    const command = process.platform === 'win32' ? 'node' : 'openclaw';
    const args = process.platform === 'win32'
      ? [windowsOpenClaw, 'infer', 'model', 'run', '--model', model, '--prompt', prompt, '--json']
      : ['infer', 'model', 'run', '--model', model, '--prompt', prompt, '--json'];
    const child = spawn(
      command,
      args,
      {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`OpenClaw Kimi request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(redact(stderr || stdout || `OpenClaw exited with code ${code}.`)));
        return;
      }
      resolve(stdout);
    });
  });
}

const [goalPage, setupWizard, layout, css, readme] = await Promise.all([
  readExcerpt('src/app/goal/page.tsx', 1800),
  readExcerpt('src/app/setup/SetupWizard.tsx', 2200),
  readExcerpt('src/app/layout.tsx', 900),
  readExcerpt('src/app/globals.css', 1800),
  readExcerpt('README.md', 1200),
]);

const userPrompt = process.argv.slice(2).join(' ').trim() || [
  'Create a design direction for ClaimBot as a hosted web app.',
  'Focus on the setup/onboarding and /goal experience for users who want class action claim matching with authorization gates.',
].join(' ');

const prompt = [
  'You are Kimi, acting as a senior product designer and UI director.',
  'Be concrete, implementation-aware, and legally careful.',
  'Avoid hype. Prioritize trust, user control, proof-required review, authorization gates, and shadow-mode safety.',
  'Return markdown with component-level recommendations that can be implemented in a Next.js SaaS UI.',
  '',
  userPrompt,
  '',
  'Current /goal page:',
  '```tsx',
  goalPage,
  '```',
  '',
  'Current setup wizard:',
  '```tsx',
  setupWizard,
  '```',
  '',
  'Current layout:',
  '```tsx',
  layout,
  '```',
  '',
  'Current global CSS excerpt:',
  '```css',
  css,
  '```',
  '',
  'README product notes:',
  '```md',
  readme,
  '```',
].join('\n');

let stdout;
try {
  stdout = await runOpenClaw(prompt);
} catch (error) {
  console.error(redact(error.message));
  process.exit(1);
}

let json;
try {
  json = JSON.parse(stdout);
} catch {
  console.error('OpenClaw returned non-JSON output.');
  console.error(redact(stdout.slice(0, 1200)));
  process.exit(1);
}

if (!json.ok) {
  console.error(redact(JSON.stringify(json, null, 2).slice(0, 1600)));
  process.exit(1);
}

const content = json.outputs?.map((output) => output.text).filter(Boolean).join('\n\n');
if (!content) {
  throw new Error('OpenClaw Kimi returned no design content.');
}

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, cleanContent(content) + '\n', 'utf8');

console.log(`[kimi-openclaw-design] wrote ${outFile}`);
