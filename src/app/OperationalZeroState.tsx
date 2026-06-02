import type { ReactNode } from 'react';
import { ClipboardCheck, FileSearch, History, ShieldCheck } from 'lucide-react';

type ZeroStateVariant = 'review' | 'claims' | 'audit';

interface OperationalZeroStateProps {
  variant: ZeroStateVariant;
  meta?: string;
  actions?: ReactNode;
}

const pipeline = [
  'Shadow Scan',
  'Category Match',
  'Proof Upload',
  'Manual Review',
  'History Archive',
] as const;

const copy = {
  review: {
    eyebrow: 'Review intake router',
    title: 'No authorized matches are waiting yet',
    body: 'The review queue stays empty until a settlement matches saved account facts, active category permission, proof rules, and deadline checks.',
    contextTitle: 'Why this is empty',
    contextBody: 'ClaimBot is protecting the filing lane. Nothing reaches review until the matcher produces a traceable candidate that can be inspected before final checks.',
    stage: 1,
    Icon: FileSearch,
  },
  claims: {
    eyebrow: 'No claims tracked yet',
    title: 'No claims are being tracked yet',
    body: 'Claims appear here only after review confirms eligibility, permission, form availability, proof status, and the current automation plan.',
    contextTitle: 'Why this is empty',
    contextBody: 'An empty tracker means no reviewed claim has passed every filing check yet. Review-ready items can be prepared later, but blind submission remains blocked.',
    stage: 3,
    Icon: ClipboardCheck,
  },
  audit: {
    eyebrow: 'Ledger initialized',
    title: 'Account history is ready for its first reviewed action',
    body: 'Account records appear after intake, matching, permission, tracking, or final-check activity creates a real event tied to this workspace.',
    contextTitle: 'Why this is empty',
    contextBody: 'The log is dormant by design until a verified action occurs. Every future record keeps the actor, entity, timestamp, and payload together for support review.',
    stage: 4,
    Icon: History,
  },
} satisfies Record<ZeroStateVariant, {
  eyebrow: string;
  title: string;
  body: string;
  contextTitle: string;
  contextBody: string;
  stage: number;
  Icon: typeof ShieldCheck;
}>;

export function OperationalZeroState({ variant, meta, actions }: OperationalZeroStateProps) {
  const state = copy[variant];
  const Icon = state.Icon;
  const auditBadge = variant === 'audit' ? 'Account History: Awaiting First Reviewed Claim' : 'Account History: Recording';

  return (
    <section className={`operational-zero-state ${variant}`} aria-label={`${state.eyebrow} zero state`}>
      <div className="operational-zero-ribbon" aria-label="Active safety checks">
        <span><ShieldCheck size={14} aria-hidden="true" /> Shadow Mode: On</span>
        <span>Category permission: Required</span>
        <span>Proof Review: Enforced</span>
        <span>{auditBadge}</span>
      </div>

      <div className="operational-zero-main">
        <div className="operational-zero-icon" aria-hidden="true">
          <Icon size={30} strokeWidth={1.9} />
        </div>
        <div>
          <div className="eyebrow">{state.eyebrow}</div>
          <h2>{state.title}</h2>
          <p>{state.body}</p>
          {meta && <span className="operational-zero-meta">{meta}</span>}
        </div>
      </div>

      <div className="operational-zero-context">
        <strong>{state.contextTitle}</strong>
        <p>{state.contextBody}</p>
      </div>

      <div className="operational-zero-pipeline" aria-label="Claim lifecycle preview">
        {pipeline.map((label, index) => (
          <div
            className={`operational-zero-step ${
              index < state.stage ? 'done' : index === state.stage ? 'active' : ''
            }`}
            key={label}
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      {actions && <div className="operational-zero-actions">{actions}</div>}
    </section>
  );
}
