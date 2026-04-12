import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ClaimBot — Free Money From Class Action Settlements',
  description: 'Automatically find and file class action settlement claims you qualify for.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span style={{ fontSize: 20 }}>$</span> ClaimBot
            </Link>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/settlements">My Settlements</Link>
              <Link href="/claims">My Claims</Link>
              <Link href="/profile">My Profile</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
