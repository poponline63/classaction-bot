// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { SETTLEMENT_CATEGORIES } from '@db/schema';

const TABS = ['My Info', 'Purchases', 'Data Breaches', 'Authorizations', 'Settings'];

const FRIENDLY_CATEGORIES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Product Purchases',
  SUBSCRIPTION_SERVICE: 'Subscription Services',
  DATA_BREACH: 'Data Breaches',
  ROBOCALL_TCPA: 'Unwanted Calls/Texts',
  DECEPTIVE_ADVERTISING: 'False Advertising',
  AUTO_DEFECT: 'Vehicle Issues',
  EMPLOYMENT: 'Employment',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Products you bought that were defective, overpriced, or falsely marketed',
  SUBSCRIPTION_SERVICE: 'Subscriptions you were auto-enrolled in or had trouble canceling',
  DATA_BREACH: 'Your personal info was exposed in a company\'s data breach',
  ROBOCALL_TCPA: 'You received spam calls or texts you didn\'t sign up for',
  DECEPTIVE_ADVERTISING: 'You bought something based on misleading ads or labels',
  AUTO_DEFECT: 'Your vehicle had a manufacturer defect or recall issue',
  EMPLOYMENT: 'You were underpaid, misclassified, or had your rights violated at work',
};

const ATTESTATION_TEMPLATES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE: 'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH: 'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA: 'I certify under penalty of perjury that I received unsolicited calls or texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING: 'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT: 'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT: 'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

export default function ProfilePage() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <h1>My Profile</h1>
      <p className="subtitle">Your information, purchases, breaches, and claim settings</p>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`tab ${i === tab ? 'active' : ''}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <TabInfo />}
      {tab === 1 && <TabPurchases />}
      {tab === 2 && <TabBreaches />}
      {tab === 3 && <TabAuthorizations />}
      {tab === 4 && <TabSettings />}
    </>
  );
}

// ─── My Info ─────────────────────────────────────────────────────────────────
function TabInfo() {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [emails, setEmails] = useState('');
  const [phones, setPhones] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.append('legalName', name);
    fd.append('dateOfBirth', dob);
    fd.append('emails', emails);
    fd.append('phones', phones);
    fd.append('addressesJson', JSON.stringify([{ street, city, state, zip, country: 'US' }].filter(a => a.street)));
    await fetch('/api/setup/profile', { method: 'POST', body: fd });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3>Personal Information</h3>
      <p className="muted small" style={{ marginBottom: 16 }}>This info is used to auto-fill claim forms. We never share it.</p>
      <div className="form">
        <div>
          <label>Your full legal name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Q. Doe" />
          <div className="hint">Must match your ID — this goes on official claim forms</div>
        </div>
        <div>
          <label>Date of birth</label>
          <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
          <div className="hint">Some claims require your age to verify eligibility</div>
        </div>
        <div>
          <label>Email address(es)</label>
          <input type="text" value={emails} onChange={e => setEmails(e.target.value)} placeholder="jane@example.com" />
          <div className="hint">Separate multiple emails with commas. Used for breach matching and claim form contact.</div>
        </div>
        <div>
          <label>Phone number</label>
          <input type="tel" value={phones} onChange={e => setPhones(e.target.value)} placeholder="555-123-4567" />
          <div className="hint">Some claim forms require a phone number</div>
        </div>
        <h3 style={{ marginTop: 12, fontSize: 15 }}>Mailing Address</h3>
        <div className="hint" style={{ marginBottom: 8 }}>Where settlement checks get mailed</div>
        <div><input type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="123 Main Street" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
          <input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="State" />
          <input type="text" value={zip} onChange={e => setZip(e.target.value)} placeholder="Zip" />
        </div>
        <button className="btn" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save my info'}
        </button>
      </div>
    </div>
  );
}

// ─── Purchases ───────────────────────────────────────────────────────────────
function TabPurchases() {
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('CONSUMER_PRODUCT_PURCHASE');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [purchases, setPurchases] = useState<string[]>([]);

  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');

  const add = async () => {
    if (!merchant || !date) return;
    setSaving(true);
    const fd = new FormData();
    fd.append('merchant', merchant);
    fd.append('productName', product);
    fd.append('category', category);
    fd.append('purchaseDate', date);
    fd.append('amount', amount);
    await fetch('/api/setup/purchase', { method: 'POST', body: fd });
    setPurchases(prev => [...prev, `${merchant} — ${date}`]);
    setMerchant(''); setProduct(''); setDate(''); setAmount('');
    setSaving(false);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3>Your Purchases</h3>
      <p className="muted small" style={{ marginBottom: 16 }}>
        Add companies you've bought from. We'll match these against settlements to find money you're owed.
      </p>
      <div className="form">
        <div>
          <label>Company / Brand name</label>
          <input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. Amazon, RevitaLash, Google Play" />
        </div>
        <div>
          <label>Product (optional)</label>
          <input type="text" value={product} onChange={e => setProduct(e.target.value)} placeholder="What did you buy?" />
        </div>
        <div>
          <label>What kind of purchase?</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {cats.map(c => <option key={c} value={c}>{FRIENDLY_CATEGORIES[c] ?? c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label>When did you buy it?</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label>How much? (optional)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" placeholder="$" />
          </div>
        </div>
        <button className="btn" onClick={add} disabled={saving}>{saving ? 'Adding...' : '+ Add purchase'}</button>
      </div>
      {purchases.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Just added:</h4>
          {purchases.map((p, i) => (
            <div key={i} className="tag green" style={{ margin: '4px 4px 0 0' }}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Data Breaches ───────────────────────────────────────────────────────────
function TabBreaches() {
  const [breach, setBreach] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const add = async () => {
    if (!breach || !email) return;
    setSaving(true);
    const fd = new FormData();
    fd.append('breachName', breach);
    fd.append('email', email);
    fd.append('breachDate', date);
    await fetch('/api/setup/breach', { method: 'POST', body: fd });
    setAdded(prev => [...prev, `${breach} (${email})`]);
    setBreach(''); setEmail(''); setDate('');
    setSaving(false);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3>Data Breach Exposure</h3>
      <p className="muted small" style={{ marginBottom: 16 }}>
        If your personal info was leaked in a data breach, there might be a settlement payout waiting for you.
        Check <a href="https://haveibeenpwned.com" target="_blank" rel="noreferrer">haveibeenpwned.com</a> to see your breaches.
      </p>
      <div className="form">
        <div>
          <label>Breach name</label>
          <input type="text" value={breach} onChange={e => setBreach(e.target.value)} placeholder="e.g. LinkedIn, Facebook, LastPass, Equifax" />
          <div className="hint">The name of the company that was breached</div>
        </div>
        <div>
          <label>Your email that was exposed</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div>
          <label>When did the breach happen? (optional)</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button className="btn" onClick={add} disabled={saving}>{saving ? 'Adding...' : '+ Add breach'}</button>
      </div>
      {added.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Just added:</h4>
          {added.map((a, i) => (
            <div key={i} className="tag yellow" style={{ margin: '4px 4px 0 0' }}>{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Authorizations ──────────────────────────────────────────────────────────
function TabAuthorizations() {
  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (cat: string) => setEnabled(prev => ({ ...prev, [cat]: !prev[cat] }));

  const saveAll = async () => {
    setSaving(true);
    for (const cat of cats) {
      if (enabled[cat]) {
        const fd = new FormData();
        fd.append('category', cat);
        fd.append('enabled', 'on');
        fd.append('attestationText', ATTESTATION_TEMPLATES[cat] ?? '');
        await fetch('/api/setup/authorization', { method: 'POST', body: fd });
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3>Claim Authorizations</h3>
      <p className="muted small" style={{ marginBottom: 16 }}>
        Enable the types of claims you want us to file for you. By enabling a category,
        you're confirming that you belong to those settlement classes.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {cats.map(cat => (
          <label key={cat} style={{
            display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 12,
            background: enabled[cat] ? 'var(--accent-bg)' : 'var(--bg2)',
            border: '1px solid', borderColor: enabled[cat] ? 'var(--accent-border)' : 'var(--border)',
            cursor: 'pointer', alignItems: 'flex-start', transition: 'all 0.15s',
          }}>
            <input type="checkbox" checked={!!enabled[cat]} onChange={() => toggle(cat)} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{FRIENDLY_CATEGORIES[cat] ?? cat}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                {CATEGORY_DESCRIPTIONS[cat] ?? ''}
              </div>
              {enabled[cat] && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6 }}>
                  By enabling: "{ATTESTATION_TEMPLATES[cat]}"
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
      <button className="btn" onClick={saveAll} disabled={saving} style={{ marginTop: 16 }}>
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save authorizations'}
      </button>
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
function TabSettings() {
  const [webhook, setWebhook] = useState('');
  const [hibp, setHibp] = useState('');
  const [mode, setMode] = useState('shadow');
  const [maxDay, setMaxDay] = useState('20');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.append('discord_webhook_url', webhook);
    fd.append('hibp_api_key', hibp);
    fd.append('claim_filer_mode', mode);
    fd.append('claim_filer_max_per_day', maxDay);
    await fetch('/api/settings/save', { method: 'POST', body: fd });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3>Settings</h3>
      <div className="form" style={{ marginTop: 16 }}>
        <div>
          <label>Discord notifications</label>
          <input type="text" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="Paste your Discord webhook URL" />
          <div className="hint">Get notified when new settlements are found or claims are filed</div>
        </div>
        <div>
          <label>HIBP API key (optional)</label>
          <input type="text" value={hibp} onChange={e => setHibp(e.target.value)} placeholder="Auto-import your data breach history" />
          <div className="hint">Get one at <a href="https://haveibeenpwned.com/API" target="_blank" rel="noreferrer">haveibeenpwned.com/API</a> — auto-detects breaches linked to your email</div>
        </div>
        <div>
          <label>Claim filing mode</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="shadow">Preview mode — fills forms without submitting (recommended to start)</option>
            <option value="live">Live mode — actually submits claims for you</option>
          </select>
          <div className="hint">Start with Preview to verify forms look right, then switch to Live</div>
        </div>
        <div>
          <label>Max claims per day</label>
          <input type="number" value={maxDay} onChange={e => setMaxDay(e.target.value)} min="1" max="100" />
          <div className="hint">Safety limit to prevent filing too many at once</div>
        </div>
        <button className="btn" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
