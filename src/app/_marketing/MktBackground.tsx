'use client';

// Lazy, SSR-free mount for the Kimi DocumentTunnel WebGL background.
//
// The Three.js bundle (~1MB) must never block first paint, SEO crawls, or
// users who can't / don't want heavy animation. So we:
//   • load DocumentTunnel via next/dynamic with ssr:false (client-only),
//   • only mount it once we've confirmed the browser honors motion AND can do
//     WebGL,
//   • always paint a cheap static gradient underneath as the fallback (and the
//     permanent backdrop for reduced-motion / no-WebGL visitors).
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const DocumentTunnel = dynamic(() => import('./DocumentTunnel'), { ssr: false });

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export default function MktBackground() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || !supportsWebGL()) return;

    // Defer the heavy import a tick past first paint so the page is interactive
    // before the WebGL scene spins up.
    const id = window.requestAnimationFrame(() => setEnabled(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <>
      {/* Cheap static backdrop — always present, and the only backdrop for
          reduced-motion / no-WebGL visitors. Matches the tunnel's deep void. */}
      <div className="mkt-bg-static" aria-hidden="true" />
      {enabled && <DocumentTunnel />}
    </>
  );
}
