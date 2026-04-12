// Single-user "auth" helper for MVP. Returns the ensured single user id.
// Phase 5 replaces this with next-auth; every query already filters by
// userId so the migration is literally swapping this one function.

import { ensureSingleUser } from '@db/seed';

export async function currentUserId(): Promise<number> {
  return ensureSingleUser();
}
