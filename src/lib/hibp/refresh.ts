// Refresh the user's data_breach_exposure rows from HIBP.
// Idempotent: uniqueIndex on (userId, breachName, email) prevents duplicates.

import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { breachedAccount, type HibpBreach } from './client';

export interface HibpRefreshResult {
  emailsChecked: number;
  breachesFound: number;
  inserted: number;
  skipped: boolean;
  errors: string[];
}

export async function refreshHibp(userId: number): Promise<HibpRefreshResult> {
  const result: HibpRefreshResult = {
    emailsChecked: 0,
    breachesFound: 0,
    inserted: 0,
    skipped: false,
    errors: [],
  };

  if (!process.env.HIBP_API_KEY) {
    result.skipped = true;
    return result;
  }

  const profileRows = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return result;

  const emails = profile.emailsJson ?? [];
  result.emailsChecked = emails.length;

  for (const email of emails) {
    try {
      const breaches = await breachedAccount(email);
      if (!breaches) continue;
      for (const b of breaches) {
        result.breachesFound++;
        try {
          await db
            .insert(schema.dataBreachExposure)
            .values({
              userId,
              breachName: b.Title || b.Name,
              breachDate: b.BreachDate ? new Date(b.BreachDate) : null,
              email,
              source: 'hibp',
              dataClassesJson: b.DataClasses ?? [],
              hibpBreachId: b.Name,
            })
            .onConflictDoNothing();
          result.inserted++;
        } catch (err) {
          // unique conflict is fine
          if (!/UNIQUE/i.test((err as Error).message)) {
            result.errors.push(`${email}/${b.Name}: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(`${email}: ${(err as Error).message}`);
    }
  }

  return result;
}

// Kept for module-level type surface
export type { HibpBreach };
