type Env = Record<string, string | undefined>;

export function isHostedAuthRequired(env: Env = process.env) {
  if (env.CLAIMBOT_DISABLE_AUTH === 'true') return false;
  return env.CLAIMBOT_REQUIRE_AUTH === 'true' || env.NETLIFY === 'true';
}

export function isSessionSecretReady(env: Env = process.env) {
  return (env.CLAIMBOT_SESSION_SECRET?.trim().length ?? 0) >= 32;
}

export function shouldBlockSetupForMissingAuthSecret(env: Env = process.env) {
  return isHostedAuthRequired(env) && !isSessionSecretReady(env);
}
