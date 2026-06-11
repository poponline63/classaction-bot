import type { ReactNode } from 'react';
import MktNav from './MktNav';
import MktFooter from './MktFooter';
import MktBackground from './MktBackground';

// Wraps a marketing page in the standalone Kimi chrome (nav + footer) and the
// .mkt design scope. The workspace shell is bypassed for these routes.
// MktBackground renders the fixed DocumentTunnel WebGL scene at z-index 0; all
// chrome + content sits above it in the relative z-index 1 layer.
export default function MktShell({ children }: { children: ReactNode }) {
  return (
    <div className="mkt">
      <MktBackground />
      <MktNav />
      <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
      <MktFooter />
    </div>
  );
}
