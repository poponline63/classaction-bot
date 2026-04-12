import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { upsertProfile } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const profile = rows[0];

  const emailsStr = (profile?.emailsJson ?? []).join('\n');
  const phonesStr = (profile?.phonesJson ?? []).join('\n');
  const addressesStr = JSON.stringify(profile?.addressesJson ?? [], null, 2);
  const dobStr = profile?.dateOfBirth
    ? profile.dateOfBirth.toISOString().slice(0, 10)
    : '';

  return (
    <>
      <h1>Profile</h1>
      <p className="muted small">
        Basic identity info used to fill claim forms. Addresses drive geographic scope rules.
      </p>

      <form action={upsertProfile} className="form">
        <div>
          <label htmlFor="legalName">Legal name</label>
          <input
            type="text"
            id="legalName"
            name="legalName"
            defaultValue={profile?.legalName ?? ''}
            placeholder="Jane Q. Doe"
          />
        </div>

        <div>
          <label htmlFor="dateOfBirth">Date of birth</label>
          <input type="date" id="dateOfBirth" name="dateOfBirth" defaultValue={dobStr} />
        </div>

        <div>
          <label htmlFor="emails">Emails (one per line)</label>
          <textarea id="emails" name="emails" defaultValue={emailsStr} />
        </div>

        <div>
          <label htmlFor="phones">Phones (one per line)</label>
          <textarea id="phones" name="phones" defaultValue={phonesStr} />
        </div>

        <div>
          <label htmlFor="addressesJson">
            Addresses (JSON array of {'{street,city,state,zip,country,from,to}'})
          </label>
          <textarea
            id="addressesJson"
            name="addressesJson"
            defaultValue={addressesStr}
            rows={6}
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        <div>
          <button className="btn" type="submit">
            Save profile
          </button>
        </div>
      </form>
    </>
  );
}
