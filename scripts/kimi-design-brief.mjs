import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');

for (const envFile of ['.env.local', '.env']) {
  dotenv.config({ path: path.join(root, envFile), override: false, quiet: true });
}

const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
const model = process.env.KIMI_MODEL || process.env.MOONSHOT_MODEL || 'moonshot-v1-32k';
const temperature = Number(process.env.KIMI_TEMPERATURE ?? '1');
const maxTokens = Number(process.env.KIMI_MAX_TOKENS ?? '2500');
const timeoutMs = Number(process.env.KIMI_TIMEOUT_MS ?? '90000');
const outFile = process.env.KIMI_DESIGN_OUT || path.join(root, 'docs', 'kimi-design-brief.md');

function usage() {
  console.error('Missing KIMI_API_KEY or MOONSHOT_API_KEY.');
  console.error('Set a rotated key in your shell or .env.local, then run: npm run design:kimi');
}

async function readIfExists(file) {
  try {
    return await fs.readFile(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
}

if (!apiKey) {
  usage();
  process.exit(1);
}

function safeApiError(status, text) {
  let message = `Kimi API error ${status}.`;
  try {
    const json = JSON.parse(text);
    const rawMessage = json.error?.message;
    if (typeof rawMessage === 'string') {
      if (status === 401 || status === 403) {
        message += ' Check that the API key is valid and active.';
      } else if (status === 429) {
        message += ' The provider rejected the request for quota, balance, or rate-limit reasons.';
      } else {
        message += ` ${rawMessage.replace(/org-[a-z0-9]+|ak-[a-z0-9]+|sk-[A-Za-z0-9_-]+/g, '[redacted]')}`;
      }
      return message;
    }
  } catch {
    // Fall through to the generic message.
  }
  return message;
}

const [goalPage, layout, css, readme] = await Promise.all([
  readIfExists('src/app/goal/page.tsx'),
  readIfExists('src/app/layout.tsx'),
  readIfExists('src/app/globals.css'),
  readIfExists('README.md'),
]);

const userPrompt = process.argv.slice(2).join(' ').trim() || [
  'Create a design direction for ClaimBot as a hosted web app.',
  'The app helps users review class action claim opportunities against saved facts, authorization gates, proof requirements, and shadow-mode safety checks.',
  'Focus on trustworthy SaaS UX, legal/compliance clarity, responsive PC-first layout, and later mobile/PWA readiness.',
  'Give concrete recommendations for visual system, page hierarchy, copy tone, components, and the /goal page.',
].join(' ');

const body = {
  model,
  messages: [
    {
      role: 'system',
      content: [
        'You are Kimi, acting as a senior product designer and UI director.',
        'Be concrete, elegant, and implementation-aware.',
        'Avoid hype. Prioritize trust, clarity, user control, and legal-safe automation language.',
        'Return markdown with sections and actionable component-level guidance.',
        'Use plain English only. Use ASCII punctuation and characters so the saved markdown is clean in Windows terminals.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        userPrompt,
        '\n\nCurrent /goal page:\n```tsx\n' + goalPage.slice(0, 18000) + '\n```',
        '\n\nCurrent layout:\n```tsx\n' + layout.slice(0, 6000) + '\n```',
        '\n\nCurrent global CSS excerpt:\n```css\n' + css.slice(0, 18000) + '\n```',
        '\n\nREADME product/deploy notes:\n```md\n' + readme.slice(0, 9000) + '\n```',
      ].join('\n'),
    },
  ],
  temperature,
  max_tokens: maxTokens,
};

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

let response;
try {
  response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
} catch (error) {
  if (error?.name === 'AbortError') {
    console.error(`Kimi API request timed out after ${timeoutMs}ms.`);
    process.exit(1);
  }
  throw error;
} finally {
  clearTimeout(timeout);
}

if (!response.ok) {
  const text = await response.text();
  console.error(safeApiError(response.status, text));
  process.exit(1);
}

const json = await response.json();
const content = json.choices?.[0]?.message?.content;
if (!content) {
  throw new Error('Kimi returned no design content.');
}

const cleanContent = content
  .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .trim();

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, cleanContent + '\n', 'utf8');

console.log(`[kimi-design] wrote ${outFile}`);
