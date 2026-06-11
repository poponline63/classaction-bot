'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, Shield, X } from 'lucide-react';

const links = [
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/welcome#pricing' },
  { label: 'FAQ', href: '/faq' },
];

export default function MktNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <Link href="/welcome" className="mkt-brand">
          <Shield size={22} aria-hidden="true" />
          <span>ClaimBot</span>
        </Link>
        <div className="mkt-nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>{l.label}</Link>
          ))}
          <Link className="mkt-signin" href="/login">Sign in</Link>
        </div>
        <button
          className="mkt-menu-btn"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>
      <div className={`mkt-mobile-menu ${open ? 'open' : ''}`}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
        ))}
        <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
      </div>
    </nav>
  );
}
