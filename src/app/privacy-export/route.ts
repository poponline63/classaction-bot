import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const exportUrl = request.nextUrl.clone();
  exportUrl.pathname = '/api/privacy/export';
  exportUrl.search = '';

  return NextResponse.redirect(exportUrl, 303);
}
