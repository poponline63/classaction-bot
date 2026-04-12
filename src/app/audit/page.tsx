import { readRecentAudit } from '@lib/audit';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const userId = await currentUserId();
  const events = await readRecentAudit(userId, 200);

  return (
    <>
      <h1>Audit log</h1>
      <p className="muted small">
        Append-only record of every event: scrapes, matches, authorizations, claims.
      </p>

      {events.length === 0 ? (
        <div className="empty">No events yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Entity</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="small">{e.occurredAt.toISOString()}</td>
                <td><b>{e.eventType}</b></td>
                <td className="small muted">
                  {e.entityType}#{e.entityId}
                </td>
                <td className="small muted">{e.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
