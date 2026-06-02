import { existsSync, readFileSync } from 'node:fs';

function readConfig(configPath: string) {
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, 'utf8');
}

export function hasNetlifyCspHeader(configPath = 'netlify.toml') {
  const config = readConfig(configPath);
  if (!config) return false;
  return /Content-Security-Policy\s*=/.test(config) && /frame-ancestors\s+'none'/.test(config);
}

export function hasNetlifyHostedBuildConfig(configPath = 'netlify.toml') {
  const config = readConfig(configPath);
  if (!config) return false;

  return (
    /command\s*=\s*"npm run build:hosted"/.test(config)
    && /publish\s*=\s*"\.next"/.test(config)
    && /NODE_VERSION\s*=\s*"20"/.test(config)
    && /NEXT_TELEMETRY_DISABLED\s*=\s*"1"/.test(config)
  );
}

export function hasNetlifySecurityHeaders(configPath = 'netlify.toml') {
  const config = readConfig(configPath);
  if (!config) return false;

  return [
    /X-Content-Type-Options\s*=\s*"nosniff"/,
    /X-Frame-Options\s*=\s*"DENY"/,
    /Referrer-Policy\s*=\s*"strict-origin-when-cross-origin"/,
    /Permissions-Policy\s*=\s*"camera=\(\), microphone=\(\), geolocation=\(\)"/,
    /Content-Security-Policy\s*=/,
    /frame-ancestors\s+'none'/,
    /object-src\s+'none'/,
  ].every((pattern) => pattern.test(config));
}

export function hasNetlifyPwaHeaders(configPath = 'netlify.toml') {
  const config = readConfig(configPath);
  if (!config) return false;

  return (
    /for\s*=\s*"\/sw\.js"/.test(config)
    && /Cache-Control\s*=\s*"no-cache"/.test(config)
    && /for\s*=\s*"\/manifest\.webmanifest"/.test(config)
    && /Content-Type\s*=\s*"application\/manifest\+json"/.test(config)
  );
}

export function isCspEnforcedForHostedReadiness() {
  if (process.env.CLAIMBOT_ENFORCE_CSP === 'true') return true;
  if (process.env.NETLIFY === 'true') return hasNetlifySecurityHeaders();
  return false;
}
