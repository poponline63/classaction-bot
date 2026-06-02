'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { SETUP_SHADOW_REVIEW_ACK, TERMS_BOUNDARY_ACK } from '@lib/claim-filer/request-boundary';
import { ArrowRight, LockKeyhole, PauseCircle, ShieldCheck } from 'lucide-react';

const ALL_STEPS = [
  { key: 'welcome', label: 'Start', detail: 'What ClaimBot can and cannot do.' },
  { key: 'profile', label: 'Your info', detail: 'Name, contact, and mailing details.' },
  { key: 'purchases', label: 'Your facts', detail: 'Brands, services, subscriptions, and dates.' },
  { key: 'breaches', label: 'Data notices', detail: 'Breach notices or verified exposure.' },
  { key: 'authorizations', label: 'Permission', detail: 'Choose the claim types ClaimBot may review.' },
  { key: 'done', label: 'Review', detail: 'Start the first safe review.' },
];

const FRIENDLY_CATEGORIES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Product purchases',
  SUBSCRIPTION_SERVICE: 'Subscription services',
  DATA_BREACH: 'Data breaches',
  ROBOCALL_TCPA: 'Unwanted calls or texts',
  DECEPTIVE_ADVERTISING: 'False advertising',
  AUTO_DEFECT: 'Vehicle issues',
  EMPLOYMENT: 'Employment',
};

const DEFAULT_ATTESTATIONS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE: 'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH: 'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA: 'I certify under penalty of perjury that I received unsolicited calls or texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING: 'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT: 'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT: 'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

const INTAKE_SAFETY_DEFAULTS = [
  {
    title: 'No fabrication',
    detail: 'ClaimBot never invents purchases, breach notices, addresses, or eligibility facts.',
  },
  {
    title: 'Proof-required manual',
    detail: 'Proof-required matches stay in manual review until the user handles documents, purchase records, or verification.',
  },
  {
    title: 'Permission required',
    detail: 'No claim type can move forward until the user saves a matching attestation.',
  },
  {
    title: 'Shadow mode first',
    detail: 'Initial claim work is prepared and audited without live submission.',
  },
];

const SAFETY_PROTOCOL_BADGES = [
  'Customer facts',
  'No fabrication',
  'Proof required',
  'Permission',
  'Shadow scan',
  'Account history',
];

type SetupSubscriptionGate = {
  automationEnabled: boolean;
  plan: string;
  status: string;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function enabledCategories(breachImportEnabled: boolean) {
  return SETTLEMENT_CATEGORIES.filter((category) => (
    category !== 'UNKNOWN' && (breachImportEnabled || category !== 'DATA_BREACH')
  ));
}

export default function SetupWizard({
  breachImportEnabled,
  settlementSearchEnabled,
  subscription,
}: {
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
  subscription: SetupSubscriptionGate;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const steps = (breachImportEnabled ? ALL_STEPS : ALL_STEPS.filter((s) => s.key !== 'breaches'))
    .map((s) => (
      s.key === 'done' && !settlementSearchEnabled
        ? { ...s, detail: 'Start scoped review in shadow mode.' }
        : s
    ));
  const currentStep = steps[step]?.key ?? 'welcome';
  const currentStepMeta = steps[step] ?? steps[0] ?? {
    key: 'welcome',
    label: 'Start',
    detail: 'What ClaimBot can and cannot do.',
  };

  const scrollToWizardTop = () => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };
  const goToStep = (index: number) => {
    setStep(Math.max(0, Math.min(index, steps.length - 1)));
    scrollToWizardTop();
  };
  const next = () => {
    setStep((s) => Math.min(s + 1, steps.length - 1));
    scrollToWizardTop();
  };
  const back = () => {
    setStep((s) => Math.max(s - 1, 0));
    scrollToWizardTop();
  };

  async function submitForm(url: string, body: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    try {
      const fd = new FormData();
      for (const [key, value] of Object.entries(body)) {
        if (value != null) fd.append(key, String(value));
      }
      const response = await fetch(url, { method: 'POST', body: fd });
      if (!response.ok) {
        let error = 'Unable to save this step.';
        try {
          const json = await response.json();
          if (typeof json.error === 'string') error = json.error;
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        setMessage(error);
        return false;
      }
      setMessage('Saved');
      setTimeout(() => setMessage(''), 1500);
      return true;
    } catch {
      setMessage('Unable to save. Check the local server logs.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Customer intake</div>
          <h1>Start with facts</h1>
          <p>
            Add real facts, choose permissions, then start a safe review. Nothing is filed from this flow.
          </p>
        </div>
        <div className="mode-badge shadow">
          Step {step + 1} of {steps.length}
        </div>
      </div>

      <DataPrivacyAssurance currentStep={currentStep} />
      <SetupCommandCenter
        currentStepMeta={currentStepMeta}
        currentStep={currentStep}
        step={step}
        totalSteps={steps.length}
        next={next}
      />
      {currentStep === 'welcome' && <SetupControlPreamble next={next} />}

      <details className="setup-mobile-progress">
        <summary>
          <span>
            <em>Intake progress</em>
            <strong>Step {step + 1} of {steps.length} - {currentStepMeta.label}</strong>
            <small>{currentStepMeta.detail}</small>
          </span>
          <b>Show steps</b>
        </summary>
        <div className="setup-step-list" role="list" aria-label="Intake steps">
          {steps.map((s, i) => (
            <button
              key={s.key}
              className={`setup-step-button ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={(event) => {
                goToStep(i);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`${s.label}. ${s.detail}`}
              type="button"
            >
              <span>{i + 1}</span>
              <strong>{s.label}</strong>
              <small>{s.detail}</small>
            </button>
          ))}
        </div>
      </details>

      <div className="setup-layout">
        <aside className="setup-sidebar">
          <div className="setup-sidebar-head">
            <h2>Intake steps</h2>
            <p>Move through the basics. Uncertain or proof-heavy claims stay in review.</p>
          </div>
          <div className="setup-step-list" role="list" aria-label="Intake steps">
            {steps.map((s, i) => (
              <button
                key={s.key}
                className={`setup-step-button ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                onClick={() => goToStep(i)}
                aria-current={i === step ? 'step' : undefined}
                aria-label={`${s.label}. ${s.detail}`}
                type="button"
              >
                <span>{i + 1}</span>
                <strong>{s.label}</strong>
                <small>{s.detail}</small>
              </button>
            ))}
          </div>
          <SetupGateLedger currentStep={currentStep} />
          <div className="compliance-box">
            ClaimBot prepares claim activity from user-provided facts. Proof-required or uncertain matches
            remain in review until the user handles the missing evidence.
          </div>
          <div className="compliance-box">
            It will not fabricate purchases, invent breach notices, bypass proof requirements, or submit
            claims without an active category permission and filing-mode review.
          </div>
        </aside>

        <section className="setup-main" id="setup-current-step">
          {message && (
            <div className={`notice setup-message ${message === 'Saved' ? '' : 'warn'}`} role="status" aria-live="polite">
              {message}
            </div>
          )}

          {currentStep !== 'welcome' && currentStep !== 'done' && <SafetyProtocolStrip />}
          {currentStep !== 'done' && <SetupGateLedger currentStep={currentStep} compact />}

          {currentStep === 'welcome' && <StepWelcome next={next} breachImportEnabled={breachImportEnabled} />}
          {currentStep === 'profile' && <StepProfile next={next} back={back} saving={saving} submitForm={submitForm} />}
          {currentStep === 'purchases' && (
            <StepPurchases
              next={next}
              back={back}
              saving={saving}
              submitForm={submitForm}
              breachImportEnabled={breachImportEnabled}
            />
          )}
          {currentStep === 'breaches' && <StepBreaches next={next} back={back} saving={saving} submitForm={submitForm} />}
          {currentStep === 'authorizations' && (
            <StepAuthorizations
              next={next}
              back={back}
              saving={saving}
              submitForm={submitForm}
              breachImportEnabled={breachImportEnabled}
            />
          )}
          {currentStep === 'done' && <StepDone settlementSearchEnabled={settlementSearchEnabled} subscription={subscription} />}
        </section>
      </div>
    </>
  );
}

function DataPrivacyAssurance({ currentStep }: { currentStep: string }) {
  const defaultCopy = {
    scope: 'Before data entry',
    body: 'Review the safety boundaries first. ClaimBot uses only saved facts and does not invent purchases, breach notices, addresses, or eligibility evidence.',
    next: 'Next: start with your info.',
  };
  const stepCopy: Record<string, { scope: string; body: string; next: string }> = {
    welcome: {
      ...defaultCopy,
    },
    profile: {
      scope: 'Name and contact',
      body: 'Your name and contact details help ClaimBot compare matches and prepare reviewed forms.',
      next: 'Next: save a legal name plus at least one reachable email or phone.',
    },
    purchases: {
      scope: 'Evidence facts',
      body: 'Purchase and subscription facts help ClaimBot find likely matches. Document notes help review, but proof-required claims stay manual.',
      next: 'Next: add only purchases or subscriptions you can stand behind.',
    },
    breaches: {
      scope: 'Breach facts',
      body: 'Breach exposure should come from notices or verifiable records. ClaimBot does not create breach evidence.',
      next: 'Next: save only verified exposure records.',
    },
    authorizations: {
      scope: 'Category consent',
      body: 'Permission tells ClaimBot which claim types it may review. It does not bypass proof, audit, or filing controls.',
      next: 'Next: enable only categories you explicitly allow.',
    },
    done: {
      scope: 'First review',
      body: 'The first run is review-only. Paid automation can run hands-off only after plan, permission, account, proof, form, and filing controls clear.',
      next: 'Next: allow safe review before starting the first scan.',
    },
  };
  const copy = stepCopy[currentStep] ?? defaultCopy;

  return (
    <section className="data-privacy-assurance" aria-label="Data Privacy Assurance">
      <span className="data-privacy-assurance-icon" aria-hidden="true">
        <LockKeyhole size={18} />
      </span>
      <div>
        <div className="data-privacy-assurance-kicker">{copy.scope}</div>
        <strong>Privacy and safety</strong>
        <p>{copy.body}</p>
        <small>{copy.next}</small>
      </div>
    </section>
  );
}

function SetupCommandCenter({
  currentStepMeta,
  currentStep,
  step,
  totalSteps,
  next,
}: {
  currentStepMeta: { key: string; label: string; detail: string };
  currentStep: string;
  step: number;
  totalSteps: number;
  next: () => void;
}) {
  const actionLabel = currentStep === 'welcome'
    ? 'Start with facts'
    : currentStep === 'authorizations'
      ? 'Review permissions'
      : currentStep === 'done'
        ? 'Start safe review'
        : `Continue ${currentStepMeta.label.toLowerCase()}`;

  return (
    <section className="setup-command-center" aria-label="Intake overview">
      <div className="setup-command-center-head">
        <div>
          <div className="setup-command-kicker">Intake overview</div>
          <h2>{currentStepMeta.label}</h2>
          <p>
            Add only facts you can stand behind. ClaimBot keeps uncertain or proof-heavy matches
            in review before any claim can move forward.
          </p>
        </div>
        <div className="setup-command-step-meter" aria-label={`Step ${step + 1} of ${totalSteps}`}>
          <span>Step</span>
          <strong>{step + 1}/{totalSteps}</strong>
        </div>
      </div>

      <div className="setup-command-center-grid">
        <div className="setup-command-panel">
          <span className="setup-command-icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <small>Current step</small>
            <strong>{currentStepMeta.detail}</strong>
            <p>Saved facts are used only with permission, review, and audit checks.</p>
          </div>
        </div>

        <div className="setup-command-panel boundary">
          <span className="setup-command-icon" aria-hidden="true">
            <LockKeyhole size={18} />
          </span>
          <div>
            <small>Safety boundary</small>
            <strong>Nothing is submitted from onboarding.</strong>
            <p>Paid automation stays paused until live mode, consent, proof review, and final approval all pass.</p>
          </div>
        </div>

        <div className="setup-command-panel action">
          <span className="setup-command-icon" aria-hidden="true">
            <PauseCircle size={18} />
          </span>
          <div>
            <small>Next action</small>
            {currentStep === 'welcome' ? (
              <button className="btn setup-command-action" type="button" onClick={next}>
                {actionLabel}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <a className="btn ghost setup-command-action" href="#setup-current-step">
                {actionLabel}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
            <p>This flow collects facts. Review remains the default.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SetupControlPreamble({ next }: { next: () => void }) {
  const items = [
    {
      title: 'Start with facts',
      detail: 'Enter only name, contact, purchase, subscription, or notice details you know are true.',
    },
    {
      title: 'Choose permissions',
      detail: 'Tell ClaimBot which claim types it may review for you.',
    },
    {
      title: 'Review before filing',
      detail: 'Proof-heavy or uncertain claims stay manual, and this flow does not submit claims.',
    },
  ];

  return (
    <section className="setup-control-preamble" aria-label="Your claim, your control">
      <div className="setup-control-copy">
        <div className="eyebrow">Simple start</div>
        <h2>Three parts: facts, permission, review.</h2>
        <p>
          ClaimBot helps organize claim review, but it does not decide for you, fabricate facts,
          or bypass consent checks.
        </p>
      </div>
      <div className="setup-control-grid">
        {items.map((item) => (
          <div className="setup-control-item" key={item.title}>
            <span className="readiness-dot pass" aria-hidden="true" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="setup-control-action">
        <button className="btn" type="button" onClick={next}>Start with facts</button>
        <span>2 minutes. No obligation to file.</span>
      </div>
    </section>
  );
}

function SetupGateLedger({ currentStep, compact = false }: { currentStep: string; compact?: boolean }) {
  const currentLabel = currentStep === 'profile'
    ? 'Next: add facts'
    : currentStep === 'purchases'
      ? 'Next: add proof if you have it'
      : currentStep === 'breaches'
        ? 'Next: confirm notices'
        : currentStep === 'authorizations'
          ? 'Next: safe review'
          : 'Next: safe review';
  const rows = [
    {
      label: 'No fabrication',
      detail: 'Only user-entered facts are used.',
      status: 'pass',
    },
    {
      label: 'Proof required',
      detail: currentStep === 'purchases' ? 'Proof references can be staged here.' : 'Proof-required claims stay manual.',
      status: currentStep === 'purchases' ? 'active' : 'pending',
    },
    {
      label: 'Manual review',
      detail: 'Uncertain or proof-heavy matches stop before claim tracking.',
      status: currentStep === 'authorizations' ? 'active' : 'pending',
    },
    {
      label: 'Category permission',
      detail: currentStep === 'authorizations' ? 'User permissions are captured here.' : 'Claim tracking waits for category consent.',
      status: currentStep === 'authorizations' ? 'active' : 'pending',
    },
    {
      label: 'Audit recording',
      detail: 'Saved facts and claim actions are traceable.',
      status: 'pass',
    },
    {
      label: 'Shadow mode',
      detail: 'Preparation and review happen before live filing.',
      status: 'pass',
    },
  ];

  return (
    <section className={`setup-gate-ledger ${compact ? 'compact' : ''}`} aria-label="Intake safeguards">
      <div className="setup-gate-ledger-head">
        <strong>Intake safeguards</strong>
        <span>{currentLabel}</span>
      </div>
      <div className="setup-gate-ledger-grid">
        {rows.map((row) => (
          <div className={`setup-gate-ledger-item ${row.status}`} key={row.label}>
            <i aria-hidden="true" />
            <span>
              <strong>{row.label}</strong>
              <small>{row.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SafetyProtocolStrip() {
  return (
    <section className="setup-safety-protocol" aria-label="Onboarding safety protocols">
      <div className="setup-safety-protocol-copy">
        <strong>Safety checks active</strong>
        <span>Real facts only - Audit recording - Manual review when needed</span>
      </div>
      <div className="setup-safety-protocol-badges" aria-label="Active setup safety controls">
        {SAFETY_PROTOCOL_BADGES.map((label) => (
          <span key={label}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

function StepWelcome({ next, breachImportEnabled }: { next: () => void; breachImportEnabled: boolean }) {
  return (
    <div className="setup-card">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">Start here</div>
          <h2>Start with real facts</h2>
        </div>
        <span className="tag blue">Shadow mode first</span>
      </div>
      <p className="muted">
        ClaimBot works best when it has real profile, purchase, subscription,
        {breachImportEnabled ? ' breach,' : ''} and permission details. It can then find
        likely matches and keep uncertain claims in review.
      </p>
      <button className="btn setup-primary-action" type="button" onClick={next}>Get started</button>
      <section className="intake-safety-ledger" aria-label="Sensitive data safety defaults">
        <div className="intake-safety-ledger-head">
          <div className="intake-safety-kicker">Before you enter anything</div>
          <h3>How ClaimBot handles sensitive data</h3>
        </div>
        <div className="intake-safety-ledger-grid">
          {INTAKE_SAFETY_DEFAULTS.map((item) => (
            <div className="intake-safety-ledger-item" key={item.title}>
              <span className="readiness-dot pass" aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="setup-summary-grid">
        <div><strong>Profile</strong><span>Name, contact, and address fields.</span></div>
        <div>
          <strong>Evidence</strong>
          <span>{breachImportEnabled ? 'Purchases, dates, and breach exposure.' : 'Purchases, subscriptions, and dates.'}</span>
        </div>
        <div><strong>Permission</strong><span>Claim types ClaimBot may review.</span></div>
        <div><strong>Review</strong><span>Proof checks before filing.</span></div>
      </div>
    </div>
  );
}

function StepProfile({ next, back, saving, submitForm }: {
  next: () => void;
  back: () => void;
  saving: boolean;
  submitForm: (url: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [emails, setEmails] = useState('');
  const [phones, setPhones] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!name.trim()) {
      setError('Enter the legal name that should appear on claim forms.');
      return false;
    }
    if (!emails.trim() && !phones.trim()) {
      setError('Add at least one email address or phone number for matching.');
      return false;
    }
    const addressesJson = JSON.stringify([{ street, city, state, zip, country: 'US' }].filter((a) => a.street));
    return submitForm('/api/setup/profile', { legalName: name, dateOfBirth: dob, emails, phones, addressesJson });
  };

  return (
    <div className="setup-card form">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">Name and contact</div>
          <h2>Profile</h2>
        </div>
        <span className="tag warn">Required</span>
      </div>
      <div>
        <label>Legal name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Q. Doe" required />
        <div className="hint">Use the name that should appear on official claim forms.</div>
      </div>
      <div>
        <label>Date of birth</label>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </div>
      <div className="field-grid">
        <div>
          <label>Email address(es)</label>
          <input type="text" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div>
          <label>Phone number(s)</label>
          <input type="text" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="555-123-4567" />
        </div>
      </div>
      <h3>Primary mailing address</h3>
      <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street address" />
      <div className="field-grid">
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
        <div className="field-grid">
          <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
          <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip" />
        </div>
      </div>
      {error && <div className="notice warn" role="alert">{error}</div>}
      <div className="setup-cta-disclosure">
        ClaimBot does not provide legal advice or guarantee claim outcomes. Data entered here is used
        to match saved facts, prepare official claim forms, and keep uncertain or proof-required claims in review.
      </div>
      <WizardActions back={back} next={next} save={save} saving={saving} saveLabel="Save and continue" />
    </div>
  );
}

function StepPurchases({ next, back, saving, submitForm, breachImportEnabled }: {
  next: () => void;
  back: () => void;
  saving: boolean;
  submitForm: (url: string, body: Record<string, unknown>) => Promise<boolean>;
  breachImportEnabled: boolean;
}) {
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('CONSUMER_PRODUCT_PURCHASE');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptPath, setReceiptPath] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const cats = enabledCategories(breachImportEnabled);

  const add = async () => {
    setError('');
    if (!merchant.trim() || !date) {
      setError('Add a company or brand and purchase date before saving this evidence.');
      return;
    }
    const saved = await submitForm('/api/setup/purchase', { merchant, productName: product, category, purchaseDate: date, amount, receiptPath });
    if (!saved) return;
    setAdded((prev) => [...prev, `${merchant} - ${date}${receiptPath ? ' - document note saved' : ''}`]);
    setMerchant('');
    setProduct('');
    setDate('');
    setAmount('');
    setReceiptPath('');
  };

  return (
    <div className="setup-card form">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">Evidence facts</div>
          <h2>Purchases and subscriptions</h2>
        </div>
        <span className="tag">Optional</span>
      </div>
      <p className="muted small">Add facts that can support settlement matching. More detail improves review quality.</p>
      <div>
        <label>Company or brand</label>
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Company name" />
      </div>
      <div>
        <label>Product or service</label>
        <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {cats.map((c) => <option key={c} value={c}>{FRIENDLY_CATEGORIES[c] ?? c}</option>)}
        </select>
      </div>
      <div className="field-grid">
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" placeholder="Optional" />
        </div>
      </div>
      <div>
        <label>Document note or secure link</label>
        <input
          type="text"
          value={receiptPath}
          onChange={(e) => setReceiptPath(e.target.value)}
          placeholder="Optional note, order number, or secure link"
        />
        <div className="hint">Saved document notes support manual review; proof-required claims still stay out of automation.</div>
      </div>
      <button className="btn ghost" type="button" onClick={add} disabled={saving}>Add purchase</button>
      {error && <div className="notice warn" role="alert">{error}</div>}
      {added.length > 0 && (
        <div className="status-row">
          {added.map((a, i) => <span key={i} className="tag green">{a}</span>)}
        </div>
      )}
      <WizardActions back={back} next={next} saving={saving} saveLabel="Continue" />
    </div>
  );
}

function StepBreaches({ next, back, saving, submitForm }: {
  next: () => void;
  back: () => void;
  saving: boolean;
  submitForm: (url: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [breachName, setBreachName] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState('');

  const add = async () => {
    setError('');
    if (!breachName.trim() || !email.trim()) {
      setError('Add the breach name and exposed email before saving this evidence.');
      return;
    }
    const saved = await submitForm('/api/setup/breach', { breachName, email, breachDate: date });
    if (!saved) return;
    setAdded((prev) => [...prev, `${breachName} (${email})`]);
    setBreachName('');
    setEmail('');
    setDate('');
  };

  return (
    <div className="setup-card form">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">Data-breach facts</div>
          <h2>Data breach exposure</h2>
        </div>
        <span className="tag">Optional</span>
      </div>
      <p className="muted small">Add breaches only when the user received notice or can verify the exposure.</p>
      <div>
        <label>Breach name</label>
        <input type="text" value={breachName} onChange={(e) => setBreachName(e.target.value)} placeholder="Company or incident name" />
      </div>
      <div>
        <label>Exposed email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
      </div>
      <div>
        <label>Breach date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn ghost" type="button" onClick={add} disabled={saving}>Add breach</button>
      {error && <div className="notice warn" role="alert">{error}</div>}
      {added.length > 0 && (
        <div className="status-row">
          {added.map((a, i) => <span key={i} className="tag yellow">{a}</span>)}
        </div>
      )}
      <WizardActions back={back} next={next} saving={saving} saveLabel="Continue" />
    </div>
  );
}

function StepAuthorizations({ next, back, saving, submitForm, breachImportEnabled }: {
  next: () => void;
  back: () => void;
  saving: boolean;
  submitForm: (url: string, body: Record<string, unknown>) => Promise<boolean>;
  breachImportEnabled: boolean;
}) {
  const cats = enabledCategories(breachImportEnabled);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const toggle = (cat: string) => setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const saveAll = async () => {
    for (const cat of cats) {
      if (enabled[cat]) {
        const saved = await submitForm('/api/setup/authorization', {
          category: cat,
          enabled: 'on',
          manualConsent: 'on',
          attestationText: DEFAULT_ATTESTATIONS[cat] ?? '',
        });
        if (!saved) return false;
      }
    }
    return true;
  };

  return (
    <div className="setup-card form">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">User attestations</div>
          <h2>Permissions</h2>
        </div>
        <span className="tag warn">Required before filing</span>
      </div>
      <p className="muted small">
        Choose only categories where your saved facts are true and ClaimBot may prepare reviewed claims.
      </p>
      <div className="setup-auth-grid">
        {cats.map((cat) => (
          <label key={cat} className={`setup-auth-option ${enabled[cat] ? 'enabled' : ''}`}>
            <input type="checkbox" checked={!!enabled[cat]} onChange={() => toggle(cat)} />
            <span>
              <strong className="setup-inline-strong">{FRIENDLY_CATEGORIES[cat] ?? cat}</strong>
              <span className="muted small">{DEFAULT_ATTESTATIONS[cat]}</span>
            </span>
          </label>
        ))}
      </div>
      <WizardActions back={back} next={next} save={saveAll} saving={saving} saveLabel="Save and finish" />
    </div>
  );
}

function StepDone({
  settlementSearchEnabled,
  subscription,
}: {
  settlementSearchEnabled: boolean;
  subscription: SetupSubscriptionGate;
}) {
  const [runState, setRunState] = useState<'idle' | 'running' | 'started' | 'error'>('idle');
  const [discoverySkipped, setDiscoverySkipped] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [shadowAuthorized, setShadowAuthorized] = useState(false);
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const planLabel = titleCase(subscription.plan);

  const startPipeline = async () => {
    setRunState('running');
    setRunMessage('');
    try {
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          setupShadowReviewAck: SETUP_SHADOW_REVIEW_ACK,
          termsBoundaryAck: TERMS_BOUNDARY_ACK,
        }),
      });
      if (!response.ok) throw new Error('Unable to start setup completion.');
      const payload = await response.json() as { discoverySkipped?: boolean };
      setDiscoverySkipped(Boolean(payload.discoverySkipped));
      setRunState('started');
    } catch {
      setRunState('error');
      setRunMessage(settlementSearchEnabled
        ? 'Unable to start the first scan. Try again, then contact support if it still fails.'
        : 'Unable to start safe review. Try again, then contact support if it still fails.');
    }
  };
  const scanStarted = runState === 'started';
  const discoveryUnavailable = !settlementSearchEnabled || discoverySkipped;
  const safeLaunchRows = [
    {
      label: 'Shadow mode active',
      detail: 'Matches surface for review and form preparation without submitting claims.',
      tone: 'pass',
    },
    {
      label: 'Proof-required review',
      detail: 'Documents, purchase records, and manual evidence requests stay in review before claim tracking.',
      tone: 'pass',
    },
    {
      label: 'Category guardrails on',
      detail: 'Only active category attestations can unlock claim tracking and final checks.',
      tone: 'pass',
    },
    {
      label: subscription.automationEnabled ? 'Automation plan active' : 'Automation plan check',
      detail: subscription.automationEnabled
        ? `${planLabel} access can run eligible no-proof claims hands-off after proof, permission, form, account, and live-mode checks pass.`
        : `${planLabel} access can start review and matching, but full automation remains locked until Pro or Founding is active.`,
      tone: subscription.automationEnabled ? 'pass' : 'warn',
    },
    {
      label: discoveryUnavailable ? 'Scoped review ready' : scanStarted ? 'First scan running' : 'First scan ready',
      detail: discoveryUnavailable
        ? 'Public settlement discovery is hidden for this deployment; imported or assigned matches stay review-checked.'
        : scanStarted
          ? 'Scrape, match, and claim review started in the background. Check the dashboard after it finishes.'
          : 'Run the first scan to start discovery, matching, and safe claim preparation.',
      tone: discoverySkipped ? 'warn' : scanStarted ? 'pass' : 'warn',
    },
  ];

  return (
    <div className="setup-card">
      <div className="setup-card-head">
        <div>
          <div className="eyebrow">{settlementSearchEnabled ? 'Ready for first scan' : 'Ready for scoped review'}</div>
          <h2>
            {discoveryUnavailable
              ? 'Facts saved. Scoped review is ready.'
              : scanStarted
                ? 'Facts saved. ClaimBot is scanning in safe mode.'
                : 'Facts saved'}
          </h2>
        </div>
        <span className="tag good">Account history enabled</span>
      </div>
      <p className="muted">
        {discoveryUnavailable
          ? 'ClaimBot can now review scoped claim opportunities against saved profile facts. Claim progress remains controlled by plan, permission, proof, and shadow-mode by default.'
          : 'ClaimBot can now load settlement sources and run matcher review. Claim progress remains controlled by plan, permission, proof, and shadow-mode by default.'}
      </p>
      {runState !== 'started' ? (
        <>
          <label className={`setup-final-authorization ${termsAcknowledged ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={termsAcknowledged}
              onChange={(event) => setTermsAcknowledged(event.target.checked)}
            />
            <span>
              <strong>I acknowledge the ClaimBot Terms boundary.</strong>
              <small>
                ClaimBot is not legal advice, does not guarantee eligibility, approval, payout amount,
                or timing, and cannot bypass administrator rules, proof requirements, permission checks,
                plan checks, final checks, or shadow-mode controls.
              </small>
            </span>
          </label>
          <label className={`setup-final-authorization ${shadowAuthorized ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={shadowAuthorized}
              onChange={(event) => setShadowAuthorized(event.target.checked)}
            />
            <span>
              <strong>I allow shadow-mode review.</strong>
              <small>
                ClaimBot may run discovery or scoped review and prepare review context. The permitted
                filing lane requires active Pro or Founding access, proof-required matches stay manual,
                and no claim is submitted automatically without explicit filing approval and live-mode checks.
              </small>
            </span>
          </label>
          <button className="btn setup-run-action" type="button" onClick={startPipeline} disabled={runState === 'running' || !shadowAuthorized || !termsAcknowledged}>
            {runState === 'running'
              ? (settlementSearchEnabled ? 'Starting scan...' : 'Starting review...')
              : (settlementSearchEnabled ? 'Run first scan' : 'Start safe review')}
          </button>
        </>
      ) : (
        <p className="muted small setup-run-note">
          {discoveryUnavailable
            ? 'Safe review started. Open match review after imported or assigned matches are available.'
            : 'First scan started. Review matches after the scan and matcher finish.'}
        </p>
      )}
      {runMessage && <div className="notice warn setup-run-note" role="alert">{runMessage}</div>}
      <div className="setup-summary-grid">
        <div>
          <strong>{discoveryUnavailable ? 'Scoped match intake' : 'Source catalog'}</strong>
          <span>
            {discoveryUnavailable
              ? 'Use imported or assigned matches for this customer workspace.'
              : 'Populate settlement records before relying on discovery results.'}
          </span>
        </div>
        <div>
          <strong>Match review</strong>
          <span>Confirm uncertain matches before any claim moves forward.</span>
        </div>
        <div>
          <strong>Permission check</strong>
          <span>Only active category permissions can unlock claim tracking.</span>
        </div>
        <div>
          <strong>Plan check</strong>
          <span>{subscription.automationEnabled ? `${planLabel} full automation active` : `${planLabel} review only; Pro or Founding required for full automation.`}</span>
        </div>
        <div>
          <strong>Terms boundary receipt</strong>
          <span>Your acknowledgement is saved before discovery, matching, or safe claim preparation starts.</span>
        </div>
        <div>
          <strong>Account access</strong>
          <span>Account access, support contact, sign-in, and safe review mode must be verified.</span>
        </div>
      </div>
      <div className="status-row">
        <span className="tag good">Shadow mode first</span>
        <span className={`tag ${subscription.automationEnabled ? 'good' : 'warn'}`}>
          {subscription.automationEnabled ? `${planLabel} automation` : 'Pro required for automation'}
        </span>
        <span className="tag">Matcher review</span>
        <span className="tag">Account history</span>
      </div>
      <div className="safe-launch-panel" aria-label="Safe review status">
        <div className="safe-launch-head">
          <strong>Safe review status</strong>
          <span>{scanStarted ? 'Working in the background' : 'Ready when you are'}</span>
        </div>
        <div className="readiness-list">
          {safeLaunchRows.map((row) => (
            <div className="readiness-item" key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="page-actions setup-next-actions">
        {settlementSearchEnabled ? (
          <Link className="btn ghost" href="/settlements">Check discovery health</Link>
        ) : (
          <Link className="btn ghost" href="/goal">Review scoped goal</Link>
        )}
        <Link className="btn ghost" href="/review">Open match review</Link>
        <Link className="btn ghost" href="/permissions">Manage permissions</Link>
        <Link className="btn ghost" href="/launch">Open account status</Link>
      </div>
    </div>
  );
}

function WizardActions({
  back,
  next,
  save,
  saving,
  saveLabel,
}: {
  back: () => void;
  next: () => void;
  save?: () => Promise<boolean>;
  saving: boolean;
  saveLabel: string;
}) {
  const onPrimary = async () => {
    if (save) {
      const saved = await save();
      if (!saved) return;
    }
    next();
  };

  return (
    <div className="page-actions wizard-actions">
      <button className="btn ghost" type="button" onClick={back}>Back</button>
      <button className="btn" type="button" disabled={saving} onClick={onPrimary}>
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  );
}
