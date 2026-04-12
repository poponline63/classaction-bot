'use client';

import { useState } from 'react';

export default function FileAllButton({ eligible }: { eligible: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ queued: number; alreadyClaimed: number } | null>(null);

  const fileAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claims/file-all', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ queued: 0, alreadyClaimed: 0 });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    if (result.queued > 0) {
      return (
        <div style={{
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
            {result.queued} new claim{result.queued > 1 ? 's' : ''} queued!
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            They'll be filed automatically.
          </span>
        </div>
      );
    }
    return (
      <div style={{
        background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
        borderRadius: 12, padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>👍</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          All eligible claims are already filed. Nothing new to do!
        </span>
      </div>
    );
  }

  return (
    <button
      className="btn lg full"
      onClick={fileAll}
      disabled={loading}
      style={{
        marginBottom: 16,
        background: loading ? 'var(--panel)' : 'linear-gradient(135deg, #4ade80, #22c55e)',
      }}
    >
      {loading ? '⏳ Filing all eligible claims...' : `💰 File all ${eligible} eligible claims now`}
    </button>
  );
}
