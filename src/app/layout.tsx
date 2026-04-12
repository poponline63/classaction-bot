import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Class Action Bot',
  description: 'Personal class action settlement tracker and auto-filer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              Class Action Bot
            </Link>
            <nav>
              <Link href="/settlements">Settlements</Link>
              <Link href="/review">Review</Link>
              <Link href="/profile">Profile</Link>
              <Link href="/purchases">Purchases</Link>
              <Link href="/breaches">Breaches</Link>
              <Link href="/authorizations">Authorizations</Link>
              <Link href="/claims">Claims</Link>
              <Link href="/settings">Settings</Link>
              <Link href="/audit">Audit</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
