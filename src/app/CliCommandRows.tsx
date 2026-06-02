'use client';

import { Check, Clipboard } from 'lucide-react';
import { useState } from 'react';

export default function CliCommandRows({
  commands,
  compact = false,
}: {
  commands: string[];
  compact?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCommand(command: string, rowKey: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(rowKey);
      window.setTimeout(() => setCopied((current) => (current === rowKey ? null : current)), 1400);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className={`cli-command-rows ${compact ? 'compact' : ''}`} aria-label="Copy-ready CLI command rows">
      {commands.map((command, index) => {
        const rowKey = `${index}:${command}`;
        const isCopied = copied === rowKey;
        return (
          <div className="cli-command-row" key={rowKey}>
            <pre><code>{command}</code></pre>
            <button
              className="cli-command-copy"
              type="button"
              onClick={() => copyCommand(command, rowKey)}
              aria-label={`Copy command: ${command}`}
            >
              {isCopied ? <Check aria-hidden="true" size={15} /> : <Clipboard aria-hidden="true" size={15} />}
              {isCopied ? 'Copied' : 'Copy command'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
