import { NextResponse, type NextRequest } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { recordPrivacyRequest } from '@lib/privacy/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function redirectToPrivacy(request: NextRequest, status: string) {
  const url = new URL('/privacy-policy', request.url);
  url.searchParams.set('privacyRequest', status);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  const contentType = request.headers.get('content-type') ?? '';
  const input = contentType.includes('application/json')
    ? await request.json().catch(() => ({}))
    : Object.fromEntries((await request.formData()).entries());
  const result = await recordPrivacyRequest(userId, {
    requestType: input.requestType,
    contactEmail: input.contactEmail,
    message: input.message,
  });

  if (!result.ok) {
    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return redirectToPrivacy(request, 'invalid');
  }

  if (contentType.includes('application/json')) {
    return NextResponse.json({
      ok: true,
      requestType: result.request.requestType,
      boundary: 'Request recorded for operator review; no destructive deletion is performed automatically.',
    });
  }

  return redirectToPrivacy(request, 'received');
}
