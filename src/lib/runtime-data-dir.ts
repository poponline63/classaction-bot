import os from 'node:os';
import path from 'node:path';

export function isHostedFunctionRuntime(env: Record<string, string | undefined> = process.env) {
  return (
    env.NETLIFY === 'true'
    || Boolean(env.AWS_LAMBDA_FUNCTION_NAME)
    || Boolean(env.LAMBDA_TASK_ROOT)
  );
}

export function getRuntimeDataDir(env: Record<string, string | undefined> = process.env) {
  if (env.CLAIMBOT_SINGLE_USER_FILE_DB === 'true' && isHostedFunctionRuntime(env) && !env.DATABASE_URL) {
    return path.join(os.tmpdir(), 'claimbot-single-user');
  }

  return env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(process.cwd(), 'data');
}
