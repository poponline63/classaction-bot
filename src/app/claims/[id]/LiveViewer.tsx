// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';

interface ProgressEvent {
  type: 'status' | 'screenshot' | 'field' | 'error' | 'done' | 'connected';
  message: string;
  screenshot?: string;
  fieldName?: string;
  fieldValue?: string;
  filledCount?: number;
  totalFields?: number;
  timestamp: number;
}

export default function LiveViewer({ claimId, initialStatus }: { claimId: number; initialStatus: string }) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState('');
  const [filledCount, setFilledCount] = useState(0);
  const [totalFields, setTotalFields] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [filing, setFiling] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const startFiling = async () => {
    setFiling(true);
    setEvents([]);
    setScreenshot(null);
    setCurrentAction('Starting...');
    setIsDone(false);

    // Connect to SSE stream FIRST
    const eventSource = new EventSource(`/api/claims/${claimId}/stream`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;

        if (data.type === 'connected') {
          setConnected(true);
          return;
        }

        setEvents(prev => [...prev, data]);

        if (data.screenshot) {
          setScreenshot(data.screenshot);
        }

        if (data.message) {
          setCurrentAction(data.message);
        }

        if (data.filledCount != null) {
          setFilledCount(data.filledCount);
        }
        if (data.totalFields != null) {
          setTotalFields(data.totalFields);
        }

        if (data.type === 'done' || data.type === 'error') {
          setIsDone(true);
          eventSource.close();
        }
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    // Then trigger the filing
    await fetch(`/api/claims/${claimId}/file`, { method: 'POST' });
  };

  // Show the viewer for active/queueable claims
  const canStart = ['QUEUED', 'FAILED', 'ABORTED'].includes(initialStatus) && !filing;

  return (
    <div style={{ marginTop: 20 }}>
      {/* Start button */}
      {canStart && (
        <button
          className="btn lg full"
          onClick={startFiling}
          style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', marginBottom: 16 }}
        >
          🤖 Watch bot file this claim
        </button>
      )}

      {/* Live viewer */}
      {filing && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            padding: '12px 18px',
            background: isDone ? 'var(--accent-bg)' : 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {!isDone ? (
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: '#4ade80',
                animation: 'pulse 1.5s infinite',
              }} />
            ) : (
              <span style={{ fontSize: 16 }}>✅</span>
            )}
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {isDone ? 'Filing complete' : 'ClaimBot is working...'}
            </span>
            {totalFields > 0 && !isDone && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
                {filledCount} / {totalFields} fields
              </span>
            )}
          </div>

          {/* Progress bar */}
          {totalFields > 0 && (
            <div style={{ height: 4, background: 'var(--bg)' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (filledCount / totalFields) * 100)}%`,
                background: isDone ? 'var(--accent)' : 'var(--blue)',
                transition: 'width 0.3s ease',
                borderRadius: 2,
              }} />
            </div>
          )}

          {/* Screenshot viewer */}
          <div style={{ background: '#000', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {screenshot ? (
              <img
                src={screenshot}
                alt="Live form view"
                style={{ width: '100%', maxHeight: 500, objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {filing ? '⏳ Loading form...' : 'Waiting to start...'}
              </div>
            )}

            {/* Current action overlay */}
            {currentAction && !isDone && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                padding: '20px 16px 12px',
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}>
                {currentAction}
              </div>
            )}
          </div>

          {/* Activity log */}
          <div
            ref={logRef}
            style={{
              maxHeight: 200, overflowY: 'auto', padding: '8px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            {events.filter(e => e.type !== 'connected').map((e, i) => (
              <div key={i} style={{
                padding: '4px 0', fontSize: 12, display: 'flex', gap: 8,
                color: e.type === 'error' ? 'var(--bad)'
                  : e.type === 'done' ? 'var(--accent)'
                  : e.type === 'field' ? 'var(--text)'
                  : 'var(--text-secondary)',
              }}>
                <span style={{ color: 'var(--muted)', minWidth: 55, fontSize: 11 }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span>
                  {e.type === 'field' && '✏️ '}
                  {e.type === 'done' && '✅ '}
                  {e.type === 'error' && '❌ '}
                  {e.type === 'status' && '🔄 '}
                  {e.message}
                </span>
              </div>
            ))}
            {events.length === 0 && filing && (
              <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--muted)' }}>
                Connecting to ClaimBot...
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
