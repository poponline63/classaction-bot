// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { SETTLEMENT_CATEGORIES } from '@db/schema';

const STEPS = ['Welcome', 'Profile', 'Auto Sign-Up', 'Quick Pick', 'Purchases', 'Breaches', 'Authorizations', 'Done'];

const DEFAULT_ATTESTATIONS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE: 'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH: 'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA: 'I certify under penalty of perjury that I received unsolicited calls/texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING: 'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT: 'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT: 'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

// ─── Auto sign-up: settlements almost EVERYONE qualifies for ───────────────
// These have extremely broad class definitions (bought beef, used Android,
// used a Visa/MC/Discover card, etc.) — no specific receipt needed.
interface AutoSignUp {
  name: string;
  payout: string;
  why: string;
  formUrl: string;
  merchant: string;
  category: string;
  period?: string;
}

const AUTO_SIGNUPS: AutoSignUp[] = [
  {
    name: 'Beef Overcharge Settlement',
    payout: 'varies',
    why: 'You bought beef between Aug 2014 - Dec 2019 in the US to feed yourself, family, or friends. Almost everyone qualifies.',
    formUrl: 'https://www.overchargedforbeef.com/en',
    merchant: 'Beef Products',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    period: '2014-08-01 to 2019-12-31',
  },
  {
    name: 'American Express Antitrust (Visa/MC/Discover users)',
    payout: 'varies',
    why: 'You used a Visa/MC debit card or Visa/MC/Discover non-rewards credit card to make a purchase between 2015-2022.',
    formUrl: 'https://amexantitrust.com/',
    merchant: 'Visa/Mastercard/Discover',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    period: '2015-01-01 to 2022-12-31',
  },
  {
    name: 'Google Android Data Settlement',
    payout: 'varies',
    why: 'You used an Android phone to access the internet via cellular data between Nov 2017 - present.',
    formUrl: 'https://www.federalcellularclassaction.com/home',
    merchant: 'Google Android',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    period: '2017-11-12 to 2026-12-31',
  },
  {
    name: 'Amazon Prime FTC Settlement',
    payout: '$51',
    why: 'You had Amazon Prime between Jun 2019 - Jun 2025 and may have been enrolled without clear consent.',
    formUrl: 'https://www.subscriptionmembershipsettlement.com/',
    merchant: 'Amazon Prime',
    category: 'SUBSCRIPTION_SERVICE',
    period: '2019-06-22 to 2025-06-22',
  },
  {
    name: 'Google Play Store Subscriptions',
    payout: '$5.85',
    why: 'You paid for ANY Google subscription renewal (apps, games, YouTube) between May 2014 - Oct 2019.',
    formUrl: 'https://playstoresubscriptionsettlement.com/',
    merchant: 'Google Play',
    category: 'SUBSCRIPTION_SERVICE',
    period: '2014-05-29 to 2019-10-26',
  },
  {
    name: 'Sprouts Receipts Settlement',
    payout: 'varies',
    why: 'You used a credit/debit card at a Sprouts grocery store in the US and had too many digits printed on the receipt.',
    formUrl: 'https://www.settleinfo.com/',
    merchant: 'Sprouts Farmers Market',
    category: 'CONSUMER_PRODUCT_PURCHASE',
  },
  {
    name: 'Ideal Image Consultation',
    payout: '$17',
    why: 'You used IdealImage.com to schedule a consultation between Jan 2023 - Jan 2026.',
    formUrl: 'https://www.idealimagesettlement.com/',
    merchant: 'Ideal Image',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    period: '2023-01-01 to 2026-01-25',
  },
  {
    name: 'Dapper Labs (NBA Top Shot, Disney Pinnacle)',
    payout: '$5',
    why: 'You had an account on NFL All Day, Disney Pinnacle, UFC Strike, or NBA Top Shot between Jun 2020 - Jan 2025.',
    formUrl: 'https://dappervppaclassactionsettlement.com/',
    merchant: 'Dapper Labs',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    period: '2020-06-14 to 2025-01-29',
  },
];

// ─── Recommended settlements most people qualify for ───────────────────────
interface Recommendation {
  name: string;
  payout: string;
  who: string;
  category: 'purchase' | 'breach' | 'subscription' | 'auto' | 'other';
  merchant?: string;
  breachName?: string;
  period?: string;
}

const RECOMMENDED: Recommendation[] = [
  { name: 'Amazon Prime - FTC Case', payout: '$51', who: 'Enrolled in Amazon Prime between Jun 2019 - Jun 2025 (unintentionally or without clear consent)', category: 'subscription', merchant: 'Amazon Prime', period: '2019-06-22 to 2025-06-22' },
  { name: 'Google Play Store Subscriptions', payout: '$5.85', who: 'Paid for ANY Google subscription renewal (apps, YouTube, etc.) between May 2014 - Oct 2019', category: 'subscription', merchant: 'Google Play', period: '2014-05-29 to 2019-10-26' },
  { name: 'LastPass Data Breach', payout: '$25 - $10,400', who: 'Had a LastPass account during the 2022 breach', category: 'breach', breachName: 'LastPass' },
  { name: 'Beef - Indirect Purchasers', payout: 'varies', who: 'Bought beef products between Aug 2014 - Dec 2019 in the US (nearly everyone)', category: 'purchase', merchant: 'Beef Products', period: '2014-08-01 to 2019-12-31' },
  { name: 'RevitaLash Serum', payout: 'varies', who: 'Bought RevitaLash lash or brow serums between Jan 2017 - Dec 2025', category: 'purchase', merchant: 'RevitaLash', period: '2017-01-01 to 2025-12-29' },
  { name: 'Sealy Bedding - Thread Count', payout: '$5 - $40', who: 'Bought any Sealy bedding product with a listed thread count', category: 'purchase', merchant: 'Sealy' },
  { name: 'Tom\'s of Maine Toothpaste', payout: 'varies', who: 'Bought Tom\'s of Maine toothpaste between Nov 2020 - Mar 2026', category: 'purchase', merchant: "Tom's of Maine", period: '2020-11-20 to 2026-03-05' },
  { name: 'Hyundai/Kia Vehicle Theft', payout: '$375 - $4,500', who: 'Owned/leased certain 2011-2022 Hyundai or Kia vehicles that were stolen or had attempted theft', category: 'auto', merchant: 'Hyundai/Kia' },
  { name: 'Avis Rent a Car Data Breach', payout: 'up to $5,000', who: 'Notified about the Aug 2023 Avis data breach', category: 'breach', breachName: 'Avis' },
  { name: 'Huuuge Casino', payout: 'varies', who: 'Made ANY in-app purchase in Huuuge Casino or Billionaire Casino before Jan 2025', category: 'purchase', merchant: 'Huuuge Casino' },
  { name: 'Grubhub/Seamless Delivery Fees (CA)', payout: '$10', who: 'Ordered food through Grubhub/Seamless in California between Jan 2019 - Jan 2026', category: 'purchase', merchant: 'Grubhub' },
  { name: 'Robinhood Order Flow', payout: 'varies', who: 'Traded on Robinhood between Sep 2016 - Sep 2018', category: 'other', merchant: 'Robinhood' },
  { name: 'Tinder Age Discrimination (CA)', payout: 'varies', who: 'Paid for Tinder Plus/Gold in California while over age 29 (Mar 2015 - Feb 2019)', category: 'subscription', merchant: 'Tinder' },
  { name: 'Cadence Bank MOVEit Breach', payout: '$100 - $12,500', who: 'Notified about MOVEit data breach involving Cadence Bank', category: 'breach', breachName: 'Cadence Bank' },
  { name: 'Patelco Credit Union Breach', payout: '$100 - $5,000', who: 'Notified about the June 2024 Patelco Credit Union breach', category: 'breach', breachName: 'Patelco' },
  { name: 'McLaren Health Care Breaches', payout: 'up to $5,000', who: 'Had info compromised in McLaren Health Care 2023 or 2024 breaches', category: 'breach', breachName: 'McLaren Health Care' },
  { name: 'Capital One Shopping', payout: '$20', who: 'Participated in an affiliate commission program with an online merchant through Capital One Shopping (Jan 2020 - Dec 2025)', category: 'other', merchant: 'Capital One Shopping' },
  { name: 'Whirlpool Refrigerators', payout: 'varies', who: 'Bought a Whirlpool side-by-side refrigerator from 2018-2022', category: 'purchase', merchant: 'Whirlpool' },
  { name: 'Dapper Labs (NBA/Disney/UFC)', payout: '$5', who: 'Had an account on NFL All Day, Disney Pinnacle, UFC Strike, or NBA Top Shot (Jun 2020 - Jan 2025)', category: 'other', merchant: 'Dapper Labs' },
  { name: 'G.Skill DDR Memory', payout: 'varies', who: 'Bought G.Skill DDR-4 or DDR-5 memory products (Jan 2018 - Jan 2026)', category: 'purchase', merchant: 'G.Skill' },
];

const CATEGORY_COLORS: Record<string, string> = {
  purchase: '#4ade80',
  breach: '#f87171',
  subscription: '#60a5fa',
  auto: '#fbbf24',
  other: '#a78bfa',
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
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Class Action Bot Setup</h1>
        <div style={{ display: 'flex', gap: 6, margin: '16px 0 24px', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
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
        {step === 2 && <StepAutoSignUp next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 3 && <StepQuickPick next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 4 && <StepPurchases next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 5 && <StepBreaches next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 6 && <StepAuthorizations next={next} back={back} saving={saving} submitForm={submitForm} />}
        {step === 7 && <StepDone />}
      </div>
    </main>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────
function StepWelcome({ next }: { next: () => void }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Welcome</h2>
      <p>This wizard helps you set up your eligibility profile so the bot can match you against class action settlements and auto-file claims.</p>
      <p><b>How it works:</b></p>
      <ol style={{ lineHeight: 1.8 }}>
        <li><b>Profile</b> — your name and address for filling forms</li>
        <li><b>Auto Sign-Up</b> — settlements almost EVERYONE qualifies for (one click to add all)</li>
        <li><b>Quick Pick</b> — check off additional settlements you might qualify for</li>
        <li><b>Purchases</b> — add any extra purchases not in the picks</li>
        <li><b>Breaches</b> — add data breach exposures</li>
        <li><b>Authorize</b> — enable categories for auto-filing</li>
      </ol>
      <p className="muted small">All data is stored locally. Nothing is sent to any external server.</p>
      <button className="btn" onClick={next} style={{ marginTop: 12 }}>Get started</button>
    </div>
  );
}

// ─── Step 2: Profile ─────────────────────────────────────────────────────────
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
    await submitForm('/api/setup/profile', { legalName: name, dateOfBirth: dob, emails, phones, addressesJson: addresses });
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 2: Your Profile</h2>
      <p className="muted small">Used to auto-fill claim forms.</p>
      <div className="form">
        <div><label>Legal name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Q. Doe" /></div>
        <div><label>Date of birth</label><input type="date" value={dob} onChange={e => setDob(e.target.value)} /></div>
        <div><label>Email(s) — comma separated</label><input type="text" value={emails} onChange={e => setEmails(e.target.value)} placeholder="jane@example.com" /></div>
        <div><label>Phone(s)</label><input type="text" value={phones} onChange={e => setPhones(e.target.value)} placeholder="555-123-4567" /></div>
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
        <button className="btn" disabled={saving} onClick={async () => { await save(); next(); }}>{saving ? 'Saving...' : 'Save & continue'}</button>
        <button className="btn ghost" onClick={next}>Skip</button>
      </div>
    </div>
  );
}

// ─── Step 3: Auto Sign-Up ────────────────────────────────────────────────────
function StepAutoSignUp({ next, back, saving, submitForm }: any) {
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [count, setCount] = useState(0);

  const enrollAll = async () => {
    setEnrolling(true);
    let n = 0;
    for (const item of AUTO_SIGNUPS) {
      const dateStr = item.period?.split(' to ')[0] ?? '2020-01-01';
      await submitForm('/api/setup/purchase', {
        merchant: item.merchant,
        productName: item.name,
        category: item.category,
        purchaseDate: dateStr,
        amount: '',
      });
      n++;
    }
    setCount(n);
    setEnrolled(true);
    setEnrolling(false);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 3: Auto Sign-Up</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        These settlements have <b>extremely broad eligibility</b> — almost everyone in the US qualifies.
        Click the button below to add all of them to your profile at once.
      </p>

      <div style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
        {AUTO_SIGNUPS.map((item, i) => (
          <div key={i} style={{
            padding: '12px 16px', borderRadius: 10,
            background: enrolled ? '#0d1f17' : '#12151a',
            border: '1px solid', borderColor: enrolled ? '#4ade8040' : '#1f242c',
            transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {enrolled && <span style={{ color: '#4ade80', fontSize: 16 }}>✓</span>}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
              {item.payout !== 'varies' && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginLeft: 'auto' }}>
                  {item.payout}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#8a94a6', marginTop: 4, lineHeight: 1.5 }}>
              {item.why}
            </div>
          </div>
        ))}
      </div>

      {!enrolled ? (
        <button
          className="btn"
          onClick={enrollAll}
          disabled={enrolling}
          style={{
            width: '100%', padding: '14px', fontSize: 15, marginTop: 8,
            background: 'linear-gradient(135deg, #4ade80, #22c55e)',
          }}
        >
          {enrolling ? 'Adding all settlements...' : `✓ Sign me up for all ${AUTO_SIGNUPS.length} settlements`}
        </button>
      ) : (
        <div style={{
          textAlign: 'center', padding: '14px',
          background: '#0d1f17', borderRadius: 10,
          color: '#4ade80', fontWeight: 600, fontSize: 14,
        }}>
          ✓ Added {count} settlements to your profile!
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" onClick={next}>{enrolled ? 'Continue' : 'Skip for now'}</button>
      </div>
    </div>
  );
}

// ─── Step 4: Quick Pick ──────────────────────────────────────────────────────
function StepQuickPick({ next, back, saving, submitForm }: any) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  const toggle = (i: number) => {
    setChecked(prev => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  };

  const filtered = RECOMMENDED.filter(r => {
    if (filter !== 'all' && r.category !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.who.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const saveSelected = async () => {
    let count = 0;
    for (const i of checked) {
      const rec = RECOMMENDED[i];
      if (!rec) continue;
      if (rec.merchant) {
        const dateStr = rec.period?.split(' to ')[0] ?? '2023-01-01';
        const cat = rec.category === 'purchase' ? 'CONSUMER_PRODUCT_PURCHASE'
          : rec.category === 'subscription' ? 'SUBSCRIPTION_SERVICE'
          : rec.category === 'auto' ? 'AUTO_DEFECT'
          : 'CONSUMER_PRODUCT_PURCHASE';
        await submitForm('/api/setup/purchase', {
          merchant: rec.merchant,
          productName: rec.name,
          category: cat,
          purchaseDate: dateStr,
          amount: '',
        });
        count++;
      }
      if (rec.breachName) {
        await submitForm('/api/setup/breach', {
          breachName: rec.breachName,
          email: '(check your email)',
          breachDate: '',
        });
        count++;
      }
    }
    setSavedCount(count);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 3: Quick Pick — Do any of these apply to you?</h2>
      <p className="muted small">Check off settlements you might qualify for. These are the ones most people can claim. We'll add them to your profile automatically.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search settlements..."
          style={{ flex: 1, minWidth: 200, background: '#0b0d10', border: '1px solid #1f242c', color: '#e6e8eb', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
        />
        {['all', 'purchase', 'breach', 'subscription', 'auto', 'other'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 11, border: '1px solid',
              borderColor: filter === f ? (CATEGORY_COLORS[f] ?? '#4ade80') : '#1f242c',
              background: filter === f ? (CATEGORY_COLORS[f] ?? '#4ade80') + '20' : 'transparent',
              color: filter === f ? (CATEGORY_COLORS[f] ?? '#4ade80') : '#8a94a6',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8, maxHeight: 450, overflowY: 'auto', paddingRight: 4 }}>
        {filtered.map((rec, _fi) => {
          const realIdx = RECOMMENDED.indexOf(rec);
          const isChecked = checked.has(realIdx);
          return (
            <label
              key={realIdx}
              style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                background: isChecked ? '#0d1f17' : '#12151a',
                border: '1px solid', borderColor: isChecked ? '#4ade80' : '#1f242c',
                cursor: 'pointer', alignItems: 'flex-start',
                transition: 'all 0.15s',
              }}
              onClick={() => toggle(realIdx)}
            >
              <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ marginTop: 3, accentColor: '#4ade80' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{rec.name}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 10,
                    background: (CATEGORY_COLORS[rec.category] ?? '#666') + '20',
                    color: CATEGORY_COLORS[rec.category] ?? '#666',
                  }}>
                    {rec.category}
                  </span>
                  {rec.payout && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginLeft: 'auto' }}>
                      {rec.payout}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#8a94a6', lineHeight: 1.5 }}>{rec.who}</div>
              </div>
            </label>
          );
        })}
      </div>

      {checked.size > 0 && (
        <div style={{ marginTop: 12, padding: '8px 14px', background: '#0d1f17', borderRadius: 8, fontSize: 13, color: '#4ade80' }}>
          {checked.size} settlement{checked.size > 1 ? 's' : ''} selected
        </div>
      )}

      {savedCount > 0 && (
        <div style={{ marginTop: 8, padding: '8px 14px', background: '#0d1f17', borderRadius: 8, fontSize: 13, color: '#4ade80' }}>
          Added {savedCount} entries to your profile!
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" disabled={saving} onClick={async () => { await saveSelected(); next(); }}>
          {saving ? 'Saving...' : `Save ${checked.size} picks & continue`}
        </button>
        <button className="btn ghost" onClick={next}>Skip</button>
      </div>
    </div>
  );
}

// ─── Step 4: Extra Purchases ─────────────────────────────────────────────────
function StepPurchases({ next, back, saving, submitForm }: any) {
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('CONSUMER_PRODUCT_PURCHASE');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');

  const add = async () => {
    if (!merchant || !date) return;
    await submitForm('/api/setup/purchase', { merchant, productName: product, category, purchaseDate: date, amount });
    setAdded(prev => [...prev, `${merchant} (${date})`]);
    setMerchant(''); setProduct(''); setDate(''); setAmount('');
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 4: Additional Purchases</h2>
      <p className="muted small">Add any other purchases not covered by Quick Pick. You can always add more later from the Purchases page.</p>
      <div className="form">
        <div><label>Merchant *</label><input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Company name" /></div>
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

// ─── Step 5: Breaches ────────────────────────────────────────────────────────
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
      <h2 style={{ marginTop: 0 }}>Step 5: Data Breach Exposure</h2>
      <p className="muted small">
        Add breaches your email was involved in. Check{' '}
        <a href="https://haveibeenpwned.com" target="_blank" rel="noreferrer" style={{ color: '#4ade80' }}>haveibeenpwned.com</a>
        {' '}to find your breaches. You can also set up your HIBP API key on the Settings page for auto-import.
      </p>
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

// ─── Step 6: Authorizations ──────────────────────────────────────────────────
function StepAuthorizations({ next, back, saving, submitForm }: any) {
  const cats = SETTLEMENT_CATEGORIES.filter(c => c !== 'UNKNOWN');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const toggle = (cat: string) => setEnabled(prev => ({ ...prev, [cat]: !prev[cat] }));

  const saveAll = async () => {
    for (const cat of cats) {
      if (enabled[cat]) {
        await submitForm('/api/setup/authorization', { category: cat, enabled: 'on', attestationText: DEFAULT_ATTESTATIONS[cat] ?? '' });
      }
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Step 6: Category Authorizations</h2>
      <p className="muted small">Enable the categories you want the bot to auto-file for. Each is your legal attestation that you belong to those settlement classes.</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {cats.map(cat => (
          <label key={cat} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
            background: enabled[cat] ? '#0d1f17' : '#12151a',
            border: '1px solid', borderColor: enabled[cat] ? '#4ade80' : '#1f242c', cursor: 'pointer',
          }}>
            <input type="checkbox" checked={!!enabled[cat]} onChange={() => toggle(cat)} style={{ accentColor: '#4ade80' }} />
            <span style={{ fontSize: 13 }}>{cat.replace(/_/g, ' ').toLowerCase()}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn ghost" onClick={back}>Back</button>
        <button className="btn" disabled={saving} onClick={async () => { await saveAll(); next(); }}>{saving ? 'Saving...' : 'Save & finish'}</button>
      </div>
    </div>
  );
}

// ─── Step 7: Done ────────────────────────────────────────────────────────────
function StepDone() {
  const [started, setStarted] = useState(false);
  const startScrape = async () => {
    setStarted(true);
    try { await fetch('/api/setup/complete', { method: 'POST' }); } catch {}
  };

  return (
    <div className="card" style={{ padding: 24, textAlign: 'center' }}>
      <h2 style={{ marginTop: 0 }}>Setup complete!</h2>
      <p>Your profile is configured. The bot will now:</p>
      <ol style={{ textAlign: 'left', lineHeight: 1.8 }}>
        <li>Scrape classaction.org daily for new settlements</li>
        <li>Match against your purchases and breach exposure</li>
        <li>Show ELIGIBLE matches on the <b>Review</b> page</li>
        <li>Auto-file claims in <b>shadow mode</b> (fills forms without submitting)</li>
      </ol>
      {!started ? (
        <button className="btn" onClick={startScrape} style={{ marginTop: 16 }}>Run first scrape now</button>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: '#4ade80' }}>Scraping started! This takes about a minute.</p>
          <a href="/" className="btn ghost" style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none' }}>Go to Dashboard</a>
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <a href="/settings" style={{ color: '#8a94a6', fontSize: 13 }}>Configure advanced settings</a>
      </div>
    </div>
  );
}
