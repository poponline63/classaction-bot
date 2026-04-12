// @ts-nocheck
'use client';

import { useState } from 'react';
import { SETTLEMENT_CATEGORIES } from '@db/schema';

const STEPS = ['Welcome', 'Profile', 'Purchases', 'Breaches', 'Authorizations', 'Done'];

const DEFAULT_ATTESTATIONS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE:
    'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE:
    'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH:
    'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA:
    'I certify under penalty of perjury that I received unsolicited calls/texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING:
    'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT:
    'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT:
    'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function submitForm(url: string, body: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(body)) {
        if (v != null) fd.append(k, String(v));
      }
      await fetch(url, { method: 'POST', body: fd });
      setMessage('Saved!');
      setTimeout(() => setMessage(''), 1500);
    } catch {
      setMessage('Error saving');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: 650, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Class Action Bot Setup</h1>
        <div style={{ display: 'flex', gap: 8, margin: '16px 0 24px', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: i === step ? 700 : 400,
                background: i < step ? '#0d1f17' : i === step ? '#4ade80' : '#1c2230',
                color: i === step ? '#000' : i < step ? '#4ade80' : '#8a94a6',
                cursor: 'pointer',
              }}
              onClick={() => setStep(i)}
            >
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {message && (
          <div style={{ background: '#0d1f17', color: '#4ade80', padding: '8px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {message}
          </div>
        )}

        {step === 0 && <StepWelcome next={next} />}
        {step === 1 && <StepProfile next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 2 && <StepPurchases next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 3 && <StepBreaches next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 4 && <StepAuthorizations next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 5 && <StepDone />}
      </div>
    </main>
  );
}

function StepWelcome({ next }: { next: () => void }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Welcome</h2>
      <p>This wizard will help you set up your eligibility profile so the bot can match you against class action settlements and auto-file claims on your behalf.</p>
      <p><b>How it works:</b></p>
      <ol style={{ lineHeight: 1.8 }}>
        <li>Enter your <b>profile info</b> (name, address, email) — used to fill claim forms</li>
        <li>Record your <b>purchases</b> — matched against consumer product settlements</li>
        <li>Add your <b>data breach exposures</b> — matched against breach settlements</li>
        <li>Enable <b>category authorizations</b> — your legal attestation that you belong to those classes</li>
        <li>The bot scrapes settlement sites daily, runs the matcher, and files eligible claims automatically</li>
      </ol>
      <p className="muted small">All data is stored locally on your machine. Nothing is sent to any server.</p>
      <div style={{ marginTop: 20 }}>
        <button className="btn" onClick={next}>Get started</button>
      </div>
    </div>
  );
}

function StepProfile({ next, back, saving, submitForm }: any) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [emails, setEmails] = useState('');
  const [phones, setPhones] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const save = async () => {
    const addresses = JSON.stringify([{ street, city, state, zip, country: 'US' }].filter(a => a.street));
    await submitForm('/api/setup/profile', {
      legalName: name, dateOfBirth: dob, emails, phones, addressesJson: addresses,
    });
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 2: Your Profile</h2>
      <p className="muted small">Used to fill claim forms automatically.</p>
      <div className="form">
        <div><label>Legal name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Q. Doe" /></div>
        <div><label>Date of birth</label><input type="date" value={dob} onChange={e => setDob(e.target.value)} /></div>
        <div><label>Email(s) — comma separated</label><input type="text" value={emails} onChange={e => setEmails(e.target.value)} placeholder="jane@example.com, j.doe@work.com" /></div>
        <div><label>Phone(s) — comma separated</label><input type="text" value={phones} onChange={e => setPhones(e.target.value)} placeholder="555-123-4567" /></div>
        <h3 style={{ fontSize: 14, marginTop: 16 }}>Primary address</h3>
        <div><label>Street</label><input type="text" value={street} onChange={e => setStreet(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <div><label>City</label><input type="text" value={city} onChange={e => setCity(e.target.value)} /></div>
          <div><label>State</label><input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="CA" /></div>
          <div><label>Zip</label><input type="text" value={zip} onChange={e => setZip(e.target.value)} /></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" disabled={saving} onClick={async () => { await save(); next(); }}>
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
        <button className="btn ghost" onClick={next}>Skip</button>
      </div>
    </div>
  );
}

function StepPurchases({ next, back, saving, submitForm }: any) {
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('CONSUMER_PRODUCT_PURCHASE');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [added, setAdded] = useState<string[]>([]);

  const add = async () => {
    if (!merchant || !date) return;
    await submitForm('/api/setup/purchase', { merchant, productName: product, category, purchaseDate: date, amount });
    setAdded(prev => [...prev, `${merchant} (${date})`]);
    setMerchant(''); setProduct(''); setDate(''); setAmount('');
  };

  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 3: Your Purchases</h2>
      <p className="muted small">Record purchases from companies you've bought from. These get matched against settlement class periods.</p>
      <div className="form">
        <div><label>Merchant *</label><input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="RevitaLash, Google Play, etc." /></div>
        <div><label>Product name</label><input type="text" value={product} onChange={e => setProduct(e.target.value)} /></div>
        <div><label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {cats.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label>Purchase date *</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label>Amount ($)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" /></div>
        </div>
        <button className="btn" disabled={saving} onClick={add} type="button">{saving ? '...' : '+ Add purchase'}</button>
      </div>
      {added.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <b>Added:</b> {added.map((a, i) => <span key={i} className="tag good" style={{ marginRight: 6 }}>{a}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" onClick={next}>Continue</button>
      </div>
    </div>
  );
}

function StepBreaches({ next, back, saving, submitForm }: any) {
  const [breachName, setBreachName] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [added, setAdded] = useState<string[]>([]);

  const add = async () => {
    if (!breachName || !email) return;
    await submitForm('/api/setup/breach', { breachName, email, breachDate: date });
    setAdded(prev => [...prev, `${breachName} (${email})`]);
    setBreachName(''); setEmail(''); setDate('');
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 4: Data Breach Exposure</h2>
      <p className="muted small">Record any data breaches your email was involved in. Check <a href="https://haveibeenpwned.com" target="_blank" rel="noreferrer" style={{ color: '#4ade80' }}>haveibeenpwned.com</a> to see your breaches.</p>
      <div className="form">
        <div><label>Breach name *</label><input type="text" value={breachName} onChange={e => setBreachName(e.target.value)} placeholder="LinkedIn, Facebook, Equifax..." /></div>
        <div><label>Email exposed *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label>Breach date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <button className="btn" disabled={saving} onClick={add} type="button">{saving ? '...' : '+ Add breach'}</button>
      </div>
      {added.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <b>Added:</b> {added.map((a, i) => <span key={i} className="tag warn" style={{ marginRight: 6 }}>{a}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" onClick={next}>Continue</button>
      </div>
    </div>
  );
}

function StepAuthorizations({ next, back, saving, submitForm }: any) {
  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const toggle = (cat: string) => {
    setEnabled(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const saveAll = async () => {
    for (const cat of cats) {
      if (enabled[cat]) {
        await submitForm('/api/setup/authorization', {
          category: cat,
          enabled: 'on',
          attestationText: DEFAULT_ATTESTATIONS[cat] ?? '',
        });
      }
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 5: Category Authorizations</h2>
      <p className="muted small">Enable the categories you want the bot to auto-file claims for. Each is a legal attestation that you belong to those classes.</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {cats.map(cat => (
          <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: enabled[cat] ? '#0d1f17' : '#12151a', border: '1px solid', borderColor: enabled[cat] ? '#4ade80' : '#1f242c', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!enabled[cat]} onChange={() => toggle(cat)} />
            <span style={{ fontSize: 13 }}>{cat.replace(/_/g, ' ').toLowerCase()}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" disabled={saving} onClick={async () => { await saveAll(); next(); }}>
          {saving ? 'Saving...' : 'Save & finish'}
        </button>
      </div>
    </div>
  );
}

function StepDone() {
  const [started, setStarted] = useState(false);

  const startScrape = async () => {
    setStarted(true);
    try {
      await fetch('/api/setup/complete', { method: 'POST' });
    } catch { /* ignore */ }
  };

  return (
    <div className="card" style={{ padding: 24, textAlign: 'center' }}>
      <h2 style={{ marginTop: 0 }}>Setup complete!</h2>
      <p>Your profile is configured. The bot will now:</p>
      <ol style={{ textAlign: 'left', lineHeight: 1.8 }}>
        <li>Scrape classaction.org daily for new settlements</li>
        <li>Run the matcher against your profile, purchases, and breaches</li>
        <li>Show ELIGIBLE matches on the Review page</li>
        <li>Auto-file claims in shadow mode (fills forms without clicking submit)</li>
      </ol>
      {!started ? (
        <button className="btn" onClick={startScrape} style={{ marginTop: 16 }}>
          Run first scrape now
        </button>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: '#4ade80' }}>Scraping started! This may take a minute.</p>
          <a href="/" className="btn ghost" style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none' }}>
            Go to Dashboard
          </a>
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <a href="/settings" style={{ color: '#8a94a6', fontSize: 13 }}>Configure advanced settings</a>
      </div>
    </div>
  );
}
