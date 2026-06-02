import { NextResponse } from 'next/server';
import { setSetting } from '@lib/settings';
import { isClientFeatureEnabled } from '@lib/features';
import type { SettingKey } from '@db/schema';
import { SETTING_KEYS } from '@db/schema';

export async function POST(req: Request) {
  const fd = await req.formData();
  const requestedMode = String(fd.get('claim_filer_mode') ?? 'shadow').trim();
  const liveAck = String(fd.get('claim_filer_live_ack') ?? '').trim();
  const hasHibpKey = String(fd.get('hibp_api_key') ?? '').trim().length > 0;

  if (hasHibpKey && !isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) {
    return NextResponse.json(
      { error: 'breach import settings are disabled for this client deployment' },
      { status: 403 },
    );
  }

  if (requestedMode === 'live' && !isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING')) {
    return NextResponse.json(
      { error: 'live filing is disabled for this client deployment' },
      { status: 400 },
    );
  }

  if (requestedMode === 'live' && liveAck !== 'reviewed') {
    return NextResponse.json(
      { error: 'live mode requires explicit review acknowledgement' },
      { status: 400 },
    );
  }

  for (const key of SETTING_KEYS) {
    if (key === 'setup_completed') continue;
    const value = fd.get(key);
    if (value != null) {
      const trimmed = String(value).trim();
      if (key === 'claim_filer_mode' && trimmed !== 'shadow' && trimmed !== 'live') {
        return NextResponse.json({ error: 'invalid claim_filer_mode' }, { status: 400 });
      }
      await setSetting(key as SettingKey, trimmed);
    }
  }
  if (requestedMode === 'shadow') {
    await setSetting('claim_filer_live_ack', '');
  }
  return NextResponse.json({ ok: true });
}
