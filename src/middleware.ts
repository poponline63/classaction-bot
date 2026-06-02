import { NextResponse, type NextRequest } from 'next/server';
import { isHostedAuthRequired, shouldBlockSetupForMissingAuthSecret } from '@lib/auth/hosted-gates';
import { SESSION_COOKIE_NAME, verifySignedSession } from '@lib/auth/session';

const securityHeaders: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join('; ');

const publicPathPrefixes = [
  '/_next/',
  '/login',
  '/pricing',
  '/help',
  '/contact',
  '/privacy-policy',
  '/terms',
  '/offline.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon.svg',
  '/favicon.ico',
  '/api/health',
  '/api/auth/session',
  '/api/billing/checkout',
  '/api/billing/entitlement-sync',
  '/smoke/claim-form',
  '/.netlify/identity',
];

const privateRevalidatedPublicPaths = new Set([
  '/pricing',
]);

function cspRequired() {
  if (process.env.NODE_ENV === 'development' && process.env.NETLIFY !== 'true') return false;
  return process.env.NETLIFY === 'true' || process.env.CLAIMBOT_ENFORCE_CSP === 'true';
}

function isPublicPath(pathname: string) {
  return publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function shouldSendNoStore(pathname: string) {
  if (pathname.startsWith('/_next/')) return false;
  if (pathname === '/manifest.webmanifest' || pathname === '/sw.js' || pathname === '/icon.svg' || pathname === '/favicon.ico') {
    return false;
  }
  if (pathname.startsWith('/api/')) return true;
  return !isPublicPath(pathname);
}

async function hasAppSession(request: NextRequest) {
  const session = await verifySignedSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  return Boolean(session);
}

function withSecurityHeaders(response: NextResponse, pathname: string) {

  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  if (shouldSendNoStore(pathname)) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (privateRevalidatedPublicPaths.has(pathname)) {
    response.headers.set('Cache-Control', 'private, no-cache, max-age=0, must-revalidate');
  }

  if (cspRequired()) {
    response.headers.set('Content-Security-Policy', productionCsp);
  }

  return response;
}

export async function middleware(request: NextRequest) {
  if (shouldBlockSetupForMissingAuthSecret()) {
    if (request.nextUrl.pathname === '/setup') {
      return withSecurityHeaders(NextResponse.next(), request.nextUrl.pathname);
    }

    if (request.nextUrl.pathname.startsWith('/api/setup/')) {
      return withSecurityHeaders(NextResponse.json({
        error: 'Session signing must be configured before hosted account intake can create records.',
      }, { status: 503 }), request.nextUrl.pathname);
    }
  }

  if (isHostedAuthRequired() && !isPublicPath(request.nextUrl.pathname) && !(await hasAppSession(request))) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return withSecurityHeaders(NextResponse.json({ error: 'authentication required' }, { status: 401 }), request.nextUrl.pathname);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return withSecurityHeaders(NextResponse.redirect(loginUrl), request.nextUrl.pathname);
  }

  return withSecurityHeaders(NextResponse.next(), request.nextUrl.pathname);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html).*)'],
};
