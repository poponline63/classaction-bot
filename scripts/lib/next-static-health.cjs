async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractNextStaticScripts(html, baseUrl) {
  const scripts = new Set();
  const pattern = /<script\b[^>]*\bsrc=["']([^"']*\/_next\/static\/[^"']+\.js[^"']*)["'][^>]*>/gi;
  let match = pattern.exec(html);
  while (match) {
    const rawSrc = match[1].replace(/&amp;/g, '&');
    scripts.add(new URL(rawSrc, baseUrl).toString());
    match = pattern.exec(html);
  }
  return [...scripts];
}

async function collectNextStaticHealth(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxScripts = options.maxScripts ?? 8;
  const target = new URL('/', baseUrl).toString();

  let response;
  try {
    response = await fetchWithTimeout(target, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      checkedAt: new Date().toISOString(),
      error: `Could not fetch ${target}: ${error.message}`,
      scripts: [],
      missingScripts: [],
      checkedScripts: [],
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const html = await response.text();
  const scripts = extractNextStaticScripts(html, baseUrl).slice(0, maxScripts);
  const checkedScripts = [];
  const missingScripts = [];

  for (const scriptUrl of scripts) {
    let scriptResponse;
    try {
      scriptResponse = await fetchWithTimeout(scriptUrl, timeoutMs);
    } catch (error) {
      missingScripts.push({
        url: scriptUrl,
        status: 'fetch-error',
        detail: error.message,
      });
      continue;
    }

    const status = scriptResponse.status;
    checkedScripts.push({ url: scriptUrl, status });
    if (!scriptResponse.ok) {
      missingScripts.push({
        url: scriptUrl,
        status,
        detail: `HTTP ${status}`,
      });
    }
  }

  return {
    ok: response.ok && missingScripts.length === 0,
    baseUrl,
    checkedAt: new Date().toISOString(),
    htmlStatus: response.status,
    contentType,
    scriptCount: scripts.length,
    scripts,
    checkedScripts,
    missingScripts,
    error: null,
  };
}

function formatNextStaticHealthFailure(health) {
  if (health.error) return health.error;
  if (health.htmlStatus >= 400) {
    return `${health.baseUrl} returned HTTP ${health.htmlStatus} for the app shell.`;
  }
  if (health.missingScripts.length > 0) {
    const firstMissing = health.missingScripts[0];
    return [
      `${health.baseUrl} is serving app HTML that points at a missing Next.js static chunk:`,
      `${firstMissing.url} (${firstMissing.detail})`,
      'Restart the dev server for that port, or run npm run smoke:hosted:local to test against a fresh isolated local target.',
    ].join(' ');
  }
  return `${health.baseUrl} failed the Next.js static chunk health check.`;
}

module.exports = {
  collectNextStaticHealth,
  extractNextStaticScripts,
  formatNextStaticHealthFailure,
};
