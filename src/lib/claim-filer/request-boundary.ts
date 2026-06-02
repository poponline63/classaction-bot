export const QUEUE_BOUNDARY_ACK = 'full-guarded-automation:v1';
export const FILE_BOUNDARY_ACK = 'single-claim-full-guarded-automation:v1';
export const SETUP_SHADOW_REVIEW_ACK = 'setup-shadow-review:v1';
export const TERMS_BOUNDARY_ACK = 'terms-boundary:v1';
export const QUEUE_TRUST_LOCK_ACK = 'acknowledged';
export const CLAIM_RUNNABLE_STATUSES = ['QUEUED', 'PREFLIGHT'] as const;

export function hasBoundaryAck(value: FormDataEntryValue | string | null | undefined, expected: string) {
  return typeof value === 'string' && value === expected;
}

export function isClaimRunnableStatus(value: string | null | undefined) {
  return CLAIM_RUNNABLE_STATUSES.includes(value as (typeof CLAIM_RUNNABLE_STATUSES)[number]);
}

export async function readJsonBoundaryAck(req: Request, key: string) {
  const headerAck = req.headers.get('x-claimbot-boundary-ack');
  if (headerAck) return headerAck;

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  try {
    const body = await req.json() as Record<string, unknown>;
    const value = body[key];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
