'use client';

import { Check, Clipboard } from 'lucide-react';
import { useState } from 'react';

export default function SecretSafeSnippet({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="secret-safe-snippet" aria-label={label}>
      <div className="secret-safe-snippet-head">
        <strong>{label}</strong>
        <button
          className="cli-command-copy"
          type="button"
          onClick={copySnippet}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check aria-hidden="true" size={15} /> : <Clipboard aria-hidden="true" size={15} />}
          {copied ? 'Copied' : 'Copy template'}
        </button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}
