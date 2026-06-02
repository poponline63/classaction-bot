import fs from 'node:fs';
import path from 'node:path';

function hasTemplatePlaceholder(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return false;
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

function parseEnvFile(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) return {};

  const values: Record<string, string> = {};
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

export function loadIgnoredOperatorEnvForReadiness() {
  let loaded = 0;
  let available = 0;
  for (const relativePath of ['.env.launch.local', '.env.hosted.local']) {
    const values = parseEnvFile(relativePath);
    for (const [key, value] of Object.entries(values)) {
      if (!hasValue(value)) continue;
      available += 1;
      if (hasValue(process.env[key])) continue;
      process.env[key] = value;
      loaded += 1;
    }
  }
  return { available, loaded };
}
