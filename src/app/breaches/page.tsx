import { db, schema } from '@db/client';
import { desc, eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { addBreach, deleteBreach, runHibpRefresh } from '../actions';

export const dynamic = 'force-dynamic';

export default async function BreachesPage() {
  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId))
    .orderBy(desc(schema.dataBreachExposure.breachDate));

  const hibpConfigured = !!process.env.HIBP_API_KEY;

  return (
    <>
      <h1>Data breach exposure</h1>
      <p className="muted small">
        Breaches drive the <code>ruleBreachMatch</code> rule against DATA_BREACH settlements.
      </p>

      <h2>Import from HaveIBeenPwned</h2>
      {hibpConfigured ? (
        <form action={runHibpRefresh} className="inline-form">
          <button className="btn" type="submit">
            Refresh from HIBP
          </button>
        </form>
      ) : (
        <p className="muted small">
          Set <code>HIBP_API_KEY</code> in <code>.env.local</code> to enable automatic refresh.
        </p>
      )}

      <h2>Add manually</h2>
      <form action={addBreach} className="form">
        <div>
          <label>Breach name *</label>
          <input type="text" name="breachName" required placeholder="LinkedIn (2021)" />
        </div>
        <div>
          <label>Email exposed *</label>
          <input type="email" name="email" required />
        </div>
        <div>
          <label>Breach date</label>
          <input type="date" name="breachDate" />
        </div>
        <div>
          <button className="btn" type="submit">
            Add breach
          </button>
        </div>
      </form>

      <h2>Your exposures ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="empty">No breaches recorded.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Breach</th>
              <th>Email</th>
              <th>Date</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.breachName}</td>
                <td className="small">{b.email}</td>
                <td>{b.breachDate ? b.breachDate.toISOString().slice(0, 10) : '—'}</td>
                <td className="small muted">{b.source}</td>
                <td>
                  <form action={deleteBreach} className="inline-form">
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn danger" type="submit">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
