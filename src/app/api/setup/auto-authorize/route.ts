import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  await req.text().catch(() => '');

  return NextResponse.json(
    {
      error: 'automatic category authorization is disabled',
      nextStep: 'Use /permissions or /setup so the user can manually confirm the category attestation.',
    },
    { status: 410 },
  );
}
