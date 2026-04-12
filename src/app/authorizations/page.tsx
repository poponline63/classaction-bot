import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory } from '@db/schema';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { saveAuthorization } from '../actions';

export const dynamic = 'force-dynamic';

// Default verbatim attestation text per category. The user can edit these
// before enabling — whatever they save is what gets stored in the DB.
const DEFAULT_ATTESTATIONS: Record<SettlementCategory, string> = {
  CONSUMER_PRODUCT_PURCHASE:
    'I, the undersigned, certify under penalty of perjury that I purchased the consumer products listed in my profile on the dates and for the amounts recorded, and that I am a member of the relevant settlement classes based on those purchases.',
  SUBSCRIPTION_SERVICE:
    'I, the undersigned, certify under penalty of perjury that I subscribed to the services listed in my profile during the periods recorded, and that I am a member of the relevant settlement classes based on those subscriptions.',
  DATA_BREACH:
    'I, the undersigned, certify under penalty of perjury that the personal information associated with the email addresses listed in my profile was exposed in the data breach incidents recorded in my data breach exposure log, and that I am a member of the relevant settlement classes based on that exposure.',
  ROBOCALL_TCPA:
    'I, the undersigned, certify under penalty of perjury that I received unsolicited telephone calls or text messages at the phone numbers listed in my profile, and that I am a member of the relevant settlement classes based on those calls or messages.',
  DECEPTIVE_ADVERTISING:
    'I, the undersigned, certify under penalty of perjury that I purchased the products listed in my profile in reliance on the advertising claims at issue, and that I am a member of the relevant settlement classes based on those purchases.',
  AUTO_DEFECT:
    'I, the undersigned, certify under penalty of perjury that I owned or leased the vehicles listed in my profile during the relevant periods, and that I am a member of the relevant settlement classes based on that ownership.',
  EMPLOYMENT:
    'I, the undersigned, certify under penalty of perjury that I was employed by the listed employers during the relevant periods and in the relevant roles, and that I am a member of the relevant settlement classes based on that employment.',
  UNKNOWN: '',
};

export default async function AuthorizationsPage() {
  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));

  const byCategory = new Map(rows.map((r) => [r.category, r]));

  const categories = SETTLEMENT_CATEGORIES.filter((c) => c !== 'UNKNOWN');

  return (
    <>
      <h1>Class authorizations</h1>
      <p className="muted small">
        Each authorization is your verbatim attestation that you belong to a category of class.
        The filer refuses to submit any claim whose category is not enabled here. Revoking an
        authorization cancels all queued claims in that category.
      </p>

      {categories.map((cat) => {
        const existing = byCategory.get(cat);
        const isEnabled = !!(existing?.enabled && !existing?.revokedAt);
        return (
          <div key={cat} className="card" style={{ marginTop: 14 }}>
            <h3>
              {cat.replace(/_/g, ' ').toLowerCase()}{' '}
              <span className={`tag ${isEnabled ? 'good' : ''}`}>
                {isEnabled ? 'enabled' : 'disabled'}
              </span>
            </h3>
            <form action={saveAuthorization} className="form">
              <input type="hidden" name="category" value={cat} />
              <div>
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={isEnabled}
                  />
                  Enable auto-filing for this category
                </label>
              </div>
              <div>
                <label>
                  Verbatim attestation text (version{' '}
                  {existing?.attestationVersion ?? 1})
                </label>
                <textarea
                  name="attestationText"
                  defaultValue={
                    existing?.attestationText ?? DEFAULT_ATTESTATIONS[cat]
                  }
                  rows={4}
                />
              </div>
              {existing?.authorizedAt ? (
                <div className="small muted">
                  Authorized at: {existing.authorizedAt.toISOString()}
                  {existing.revokedAt
                    ? ` • Revoked at: ${existing.revokedAt.toISOString()}`
                    : ''}
                </div>
              ) : null}
              <div>
                <button className="btn" type="submit">
                  Save
                </button>
              </div>
            </form>
          </div>
        );
      })}
    </>
  );
}
