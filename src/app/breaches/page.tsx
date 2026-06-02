import { db, schema } from '@db/client';
import { desc, eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { isClientFeatureEnabled } from '@lib/features';
import { addBreach, deleteBreach, runHibpRefresh } from '../actions';
import EvidenceHandlingPanel from '../EvidenceHandlingPanel';
import BreachEvidenceBrowser, { type BreachEvidenceBrowserRow } from './BreachEvidenceBrowser';

export const dynamic = 'force-dynamic';

function fmtDate(date: Date | null) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
}

export default async function BreachesPage() {
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="eyebrow">Breach evidence</div>
            <h1>Data breach exposure</h1>
            <p>
              Data-breach evidence intake is disabled for this workspace. Other profile
              evidence and review checks remain available.
            </p>
          </div>
        </div>
        <div className="notice warn">
          <h3>Breach intake is not enabled</h3>
          <p>
            This hosted account does not currently show manual breach intake or automatic breach refresh controls.
          </p>
        </div>
      </>
    );
  }

  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId))
    .orderBy(desc(schema.dataBreachExposure.breachDate));

  const hibpConfigured = !!process.env.HIBP_API_KEY;
  const exposedEmailCount = new Set(rows.map((row) => row.email.toLowerCase())).size;
  const datedCount = rows.filter((row) => row.breachDate).length;
  const dataClassCount = rows.reduce((total, row) => total + (row.dataClassesJson?.length ?? 0), 0);
  const hibpCount = rows.filter((row) => row.source === 'hibp').length;
  const manualCount = rows.filter((row) => row.source === 'manual').length;
  const latestBreach = rows[0]?.breachDate;
  const breachBrowserRows: BreachEvidenceBrowserRow[] = rows.map((breach) => {
    const dataClassCountForRow = breach.dataClassesJson?.length ?? 0;
    return {
      id: breach.id,
      breachName: breach.breachName,
      email: breach.email,
      breachDateLabel: fmtDate(breach.breachDate),
      sourceLabel: breach.source,
      dataClassLabel: dataClassCountForRow > 0
        ? `${dataClassCountForRow} data class${dataClassCountForRow === 1 ? '' : 'es'}`
        : 'Data classes not listed',
      dataClassCount: dataClassCountForRow,
      matcherDetail: settlementSearchEnabled
        ? 'Breach name and email support data-breach settlement matching; proof review still applies.'
        : 'Breach name and email support scoped data-breach review; proof review still applies.',
      proofDetail: 'Proof-required cases still need notice letters or supporting documents.',
      imported: breach.source === 'hibp',
      dated: Boolean(breach.breachDate),
      evidenceTone: breach.source === 'hibp' ? 'green' : breach.breachDate ? 'blue' : 'yellow',
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Breach evidence</div>
          <h1>Data breach exposure</h1>
          <p>
            {settlementSearchEnabled
              ? 'Record verified breach notices and exposed emails for data-breach settlement matching. Unverified or fuzzy matches remain in review.'
              : 'Record verified breach notices and exposed emails for scoped data-breach claim review. Unverified or fuzzy matches remain in review.'}
          </p>
        </div>
        {hibpConfigured ? (
          <form action={runHibpRefresh} className="inline-form">
            <button className="btn" type="submit">Refresh from HIBP</button>
          </form>
        ) : null}
      </div>

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Evidence coverage</h2>
          <p className="muted">
            {settlementSearchEnabled
              ? 'Breach evidence helps ClaimBot compare exposed emails, breach names, and incident dates against data-breach settlements. Proof-required cases still stay in review until the supporting notice or document trail is present.'
              : 'Breach evidence helps ClaimBot compare exposed emails, breach names, and incident dates against scoped data-breach opportunities. Proof-required cases still stay in review until the supporting notice or document trail is present.'}
          </p>
        </header>
        <div className="stats-grid" aria-label="Breach evidence coverage">
          <div className="stat-card">
            <div className="stat-label">Breach records</div>
            <div className="stat-value green">{rows.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Exposed emails</div>
            <div className="stat-value blue">{exposedEmailCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Dated records</div>
            <div className="stat-value text">{datedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest breach</div>
            <div className="stat-value text">{latestBreach ? fmtDate(latestBreach) : 'None'}</div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>{hibpCount} HIBP imports</strong>
            <span>Imported records keep their source visible for review and troubleshooting.</span>
          </div>
          <div className="trust-item">
            <strong>{manualCount} manual entries</strong>
            <span>User-provided breach facts stay editable through deletion and re-entry.</span>
          </div>
          <div className="trust-item">
            <strong>{dataClassCount} data classes</strong>
            <span>Data classes improve context when HIBP provides exposed field details.</span>
          </div>
          <div className="trust-item">
            <strong>Proof still required</strong>
            <span>ClaimBot will not invent notice letters or bypass administrator proof rules.</span>
          </div>
        </div>
      </section>

      {!hibpConfigured && (
        <div className="notice notice-spaced">
          <h3>HIBP import is optional</h3>
          <p>
            Automatic breach refresh can be connected later. Manual entries are still supported.
          </p>
        </div>
      )}

      <EvidenceHandlingPanel href="#breach-evidence-intake" />

      <BreachEvidenceBrowser rows={breachBrowserRows} />

      <div className="settings-grid">
        <form id="breach-evidence-intake" action={addBreach} className="card form">
          <h2 className="section-flush">Add breach exposure</h2>
          <div className="evidence-intake-lockup" aria-label="Evidence intake safeguards">
            <div className="evidence-intake-lock">Locked review</div>
            <div>
              <h3>Your facts. Human review. No fabrication.</h3>
              <p>
                Added evidence stays in shadow mode until a reviewer verifies your proof. ClaimBot logs every action
                and uses only facts you provide.
              </p>
              <div className="evidence-intake-actions" aria-label="Evidence support links">
                <a href="/privacy-policy">Privacy &amp; Support</a>
                <a href="/contact">Contact support</a>
              </div>
            </div>
          </div>
          <div>
            <label>Breach name</label>
            <input type="text" name="breachName" required placeholder="LinkedIn" />
          </div>
          <div>
            <label>Exposed email</label>
            <input type="email" name="email" required placeholder="jane@example.com" />
          </div>
          <div>
            <label>Breach date</label>
            <input type="date" name="breachDate" />
            <div className="hint">Optional. Use the notice date when the exact incident date is unknown.</div>
          </div>
          <button className="btn" type="submit">Add for Manual Review</button>
        </form>

        <aside className="notice warn">
          <h3>Proof posture</h3>
          <p>
            {settlementSearchEnabled
              ? 'A breach record helps identify possible data-breach settlements. It does not replace proof requirements when a settlement administrator asks for notice letters or supporting documents.'
              : 'A breach record helps evaluate scoped data-breach opportunities. It does not replace proof requirements when an administrator asks for notice letters or supporting documents.'}
          </p>
        </aside>
      </div>

      <h2>Your exposures ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="empty">
          <h3>No breach exposure recorded</h3>
          <p>Add verified breach notices or configure HIBP import.</p>
        </div>
      ) : (
        <div className="evidence-grid">
          {rows.map((breach) => (
            <article key={breach.id} className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <h3>{breach.breachName}</h3>
                  <p>{breach.email}</p>
                </div>
                <span className="tag blue">{breach.source}</span>
              </div>
              <div className="evidence-facts">
                <div>
                  <span>Breach date</span>
                  <strong>{fmtDate(breach.breachDate)}</strong>
                </div>
                <div>
                  <span>Data classes</span>
                  <strong>{breach.dataClassesJson?.length ? breach.dataClassesJson.length : 'Not listed'}</strong>
                </div>
                <div>
                  <span>Evidence posture</span>
                  <strong>Review if proof is required</strong>
                </div>
              </div>
              <div className="queue-readiness compact review">
                <strong>Matcher input</strong>
                <span>
                  {settlementSearchEnabled
                    ? 'Breach name and email are used for data-breach settlement matching.'
                    : 'Breach name and email are used for scoped data-breach claim review.'}
                </span>
              </div>
              <form action={deleteBreach} className="inline-form">
                <input type="hidden" name="id" value={breach.id} />
                <button className="btn danger sm" type="submit">Delete evidence</button>
              </form>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
