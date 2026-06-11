import type { ReactNode } from 'react';
import MktNav from './MktNav';
import MktFooter from './MktFooter';

// Wraps a marketing page in the standalone Kimi chrome (nav + footer) and the
// .mkt design scope. The workspace shell is bypassed for these routes.
export default function MktShell({ children }: { children: ReactNode }) {
  return (
    <div className="mkt">
      <MktNav />
      <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
      <MktFooter />
    </div>
  );
}
