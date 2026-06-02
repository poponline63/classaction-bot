import Link from 'next/link';

const escalationRows = [
  {
    title: 'Account access',
    body: 'Use support for sign-in, hosted access, account setup, or locked workspace questions.',
    href: '/login',
    action: 'Check access',
  },
  {
    title: 'Claim review',
    body: 'Use review, claims, and account records to troubleshoot eligibility, proof, permission, and claim status.',
    href: '/review',
    action: 'Open review',
  },
  {
    title: 'Privacy requests',
    body: 'Route profile corrections, deletion/export requests, and data-handling questions through the monitored support path.',
    href: '/privacy-policy',
    action: 'Privacy policy',
  },
  {
    title: 'Live filing safety',
    body: 'Pause or keep review mode active until account checks, proof status, and account history have been reviewed.',
    href: '/launch',
    action: 'Review status',
  },
];

interface SupportEscalationPanelProps {
  email: string | null;
  supportUrl?: string | null;
}

function supportChannelLabel(email: string | null, supportUrl?: string | null) {
  if (supportUrl?.includes('discord')) return 'Discord support ready';
  if (supportUrl) return 'Support link ready';
  if (email) return 'Monitored mailbox ready';
  return 'Support channel pending';
}

export default function SupportEscalationPanel({ email, supportUrl = null }: SupportEscalationPanelProps) {
  const supportReady = Boolean(email || supportUrl);
  const receiptRows = [
    {
      label: 'Support channel',
      value: supportChannelLabel(email, supportUrl),
      detail: supportReady
        ? 'Customer requests can route to the configured support channel.'
        : 'Set the hosted support contact before sharing account access.',
      tone: supportReady ? 'pass' : 'warn',
    },
    {
      label: 'Account context',
      value: 'Support context available',
      detail: 'Support exports preserve reviewed context without changing the saved account record.',
      tone: 'pass',
    },
    {
      label: 'Privacy route',
      value: 'Correction path visible',
      detail: 'Profile corrections, export requests, and deletion questions keep a dedicated route.',
      tone: 'pass',
    },
    {
      label: 'Safety boundary',
      value: 'Rules preserved',
      detail: 'Support can explain filing status, but cannot change proof requirements or category permissions.',
      tone: 'pass',
    },
  ];

  return (
    <section className="support-escalation-panel" aria-label="Support escalation map">
      <div className="support-escalation-head">
        <div>
          <div className="support-escalation-kicker">Support escalation map</div>
          <h2>Route questions without changing safety rules</h2>
          <p>
            Support can resolve access, data, and workflow questions, but it does not override
            proof requirements, category permissions, or the review-mode safety posture.
          </p>
        </div>
        {supportUrl ? (
          <a className="btn ghost sm" href={supportUrl}>Open support</a>
        ) : email ? (
          <a className="btn ghost sm" href={`mailto:${email}`}>Email support</a>
        ) : (
          <Link className="btn ghost sm" href="/settings">Set support contact</Link>
        )}
      </div>
      <section className="support-readiness-receipt" aria-label="Support status">
        <header className="support-readiness-receipt-head">
          <div>
            <div className="support-escalation-kicker">Support status</div>
            <h3>Customer questions stay connected to account context</h3>
            <p>
              Support can answer account and product-state questions, but it cannot bypass
              proof, permission, review mode, or account checks.
            </p>
          </div>
          <Link className="btn ghost sm" href="/audit">Open activity history</Link>
        </header>
        <div className="support-readiness-receipt-grid">
          {receiptRows.map((row) => (
            <article className={`support-readiness-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="support-escalation-grid">
        {escalationRows.map((row) => (
          <Link className="support-escalation-item" href={row.href} key={row.title}>
            <span className="readiness-dot pass" aria-hidden="true" />
            <span>
              <strong>{row.title}</strong>
              <p>{row.body}</p>
              <b>{row.action}</b>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
