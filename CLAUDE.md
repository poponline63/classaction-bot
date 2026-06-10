# ClaimBot Handoff For Claude

Last updated: June 7, 2026.

This repo is the ClaimBot web/desktop project. The user wants a customer-ready class-action settlement claim assistant that starts with simple onboarding/intake, compares saved facts against possible claim opportunities, and later supports guarded paid automation for claims that clear permission, proof, plan, form, and safety checks.

## Current Status

- Project root: `C:\Users\popon\classaction-bot`
- Local dev URL: `http://localhost:3100`
- Hosted URL: `https://claimbot-app.netlify.app`
- GitHub repo: `https://github.com/poponline63/classaction-bot`
- Netlify site: `claimbot-app`
- Netlify project ID: `40fd46c0-14d2-41b2-8538-b918109b7dcb`
- Latest relevant commit at handoff: `9a8bda2 Make onboarding intake first`
- Live health check was green at handoff: `/api/health` returned `200 OK` with `filingMode: "shadow"`.

The hosted site is currently running in single-user test mode with temporary Netlify function storage. This is okay for the owner to test the website, but data is not durable enough for real customers yet.

## Product Direction

Use this wording and product framing:

- ClaimBot checks for `possible matches` and claims a user `may qualify for`.
- Do not promise legal eligibility, guaranteed approval, guaranteed payout, payout timing, or proof bypasses.
- Customer-facing pages should stay simple: fill out intake, review possible matches, track approved claims.
- Launch, Packet Center, Audit, and Settings can contain operator/admin details. Normal customer screens should not show raw setup commands, artifact paths, launch-console language, or internal proof receipts.

The user specifically corrected onboarding: it should be an intake flow where the user fills out basic information first, then ClaimBot checks for things they may qualify for. The current `/onboarding` page now embeds the actual setup wizard starting at the profile/basic-info form.

## Design Context

Read these first before UI work:

- `PRODUCT.md`
- `DESIGN.md`
- `src/app/globals.css`

Design register is `product`, not marketing. The UI should feel like a careful product workspace: restrained dark surfaces, violet primary action, low-radius panels, clear next action, no over-decorated dashboard sprawl.

Important design rules:

- One next action beats many status panels.
- Use the existing Kimi visual system in `globals.css`.
- Keep customer surfaces plainspoken and task-first.
- Preserve 44px touch targets and visible focus states.
- Do not use huge landing-page hero marketing for app screens.
- Avoid making automation sound like a semi-automated checklist. Paid automation should sound hands-off only after guardrails are truly clear.

## App Architecture

Stack:

- Next.js 14 App Router
- TypeScript
- Drizzle ORM
- `@libsql/client` SQLite/libSQL
- Netlify with `@netlify/plugin-nextjs`
- Netlify Identity via `@netlify/identity`
- Electron packaging exists for desktop later
- Worker scripts exist under `worker/`

Important paths:

- `src/app/onboarding/page.tsx`: intake-first onboarding route.
- `src/app/setup/SetupWizard.tsx`: actual intake/setup wizard. Supports `startWithProfile` for customer onboarding.
- `src/app/page.tsx`: dashboard/home.
- `src/app/eligibility/page.tsx`: explains claim-fit readiness and points new users back to onboarding.
- `src/app/review/page.tsx`: possible match review.
- `src/app/claims/*`: claim tracking.
- `src/db/client.ts`: database client and file DB path selection.
- `src/db/seed.ts`: runtime schema bootstrap and single-user seed logic.
- `src/lib/runtime-data-dir.ts`: selects writable runtime data directory. Critical for Netlify single-user temp mode.
- `src/lib/claim-filer/submit.ts`: shadow/live filing mode logic and evidence capture paths.
- `src/lib/auth/current-user.ts`: current account/user resolution.
- `src/lib/billing/*`: entitlement and checkout behavior.
- `netlify.toml`: Netlify build/publish/plugin/headers config.

## Current Runtime Mode

The hosted Netlify app is configured for private beta testing:

- `CLAIMBOT_SINGLE_USER_FILE_DB=true`
- No hosted `DATABASE_URL` yet
- `CLAIMBOT_BETA_NO_BILLING=true`
- Filing mode should remain shadow
- `CLAIMBOT_FEATURE_LIVE_FILING` should remain false until reviewed

In Netlify functions, writes must not go to `/var/task/data`. Use `getRuntimeDataDir()` for runtime file paths. In single-user hosted mode, the app stores its temporary DB under `/tmp/claimbot-single-user`.

## Known Limitations / Not Launch Ready Yet

Do not tell the user this is ready for paying public customers until these are addressed:

1. Persistent hosted database is still needed.
   - Add a real hosted `DATABASE_URL` and token, then run migrations/imports against it.
   - Temporary single-user Netlify storage can disappear on cold starts/deploys.

2. Paid full automation worker is not production-proved.
   - Hosted web can create jobs, but a persistent worker runtime must process `file_claim` jobs with the same hosted DB.
   - Use `npm run worker` or `npm run worker:once` with hosted database env once DB exists.

3. Billing is in beta/no-billing mode.
   - Paid CTAs should stay disabled or framed as beta until processor-hosted links/webhooks and entitlement sync are verified.

4. Live filing must stay off.
   - Keep `CLAIM_FILER_MODE=shadow`.
   - Keep `CLAIMBOT_FEATURE_LIVE_FILING=false`.
   - Live filing requires explicit review and guardrail proof.

5. Source catalog/discovery quality may need refresh/import.
   - Use source scripts and validation before relying on public claim discovery.

## Commands

Local development:

```powershell
cd C:\Users\popon\classaction-bot
npm install
npm run dev
```

Open:

```text
http://localhost:3100
```

Core checks:

```powershell
npm run typecheck
npm run validate:ui
npm run validate:secrets
npm run validate:hosted
npm run validate:schema
```

Hosted-style full build gate used recently:

```powershell
$env:NETLIFY='true'
$env:CLAIMBOT_SINGLE_USER_FILE_DB='true'
$env:CLAIMBOT_BETA_NO_BILLING='true'
$env:CLAIMBOT_DISABLE_AUTH='false'
$env:CLAIMBOT_LEGAL_REVIEW_ACK='reviewed'
$env:CLAIMBOT_SESSION_SECRET='YOUR_LOCAL_TEST_SESSION_SECRET'
$env:CLAIMBOT_BILLING_SYNC_SECRET='YOUR_LOCAL_TEST_BILLING_SYNC_SECRET'
$env:SCRAPER_USER_AGENT='ClaimBot/0.1 (+https://claimbot-app.netlify.app/contact)'
$env:CLAIMBOT_SUPPORT_EMAIL='support@example.com'
npm run build:hosted
```

Do not commit real secrets. The sample values above are local test placeholders only.

Netlify:

```powershell
npx netlify status
npx netlify watch
curl.exe -i https://claimbot-app.netlify.app/api/health
```

Production deploys happen from GitHub `master` to Netlify.

## Recent Work Completed

Recent commits:

- `9a8bda2 Make onboarding intake first`
  - `/onboarding` now embeds the actual setup wizard starting at basic profile info.
  - Copy now says basic info lets ClaimBot check for claims users may match.

- `52d1fab Clarify first-run onboarding`
  - Added clearer first-run explainer and main page meaning.

- `07b9f29 Handle concurrent single-user seeding`
  - Fixed SQLite unique constraint race when temp DB cold-starts receive concurrent requests.

- `9722006 Fix hosted temp storage detection`
  - Fixed Netlify runtime storage path so the app no longer tries to write to read-only `/var/task/data`.

- `1f84ef8 Bootstrap temp settings store in single-user mode`
  - Ensured settings table bootstrap in single-user hosted mode.

- `e36fd21 Add explicit Netlify Next runtime plugin`
  - Added `@netlify/plugin-nextjs` and Netlify plugin config.

## Verification Already Done

For the latest onboarding change:

- `npm run typecheck` passed.
- `npm run validate:ui` passed.
- Chrome desktop/mobile visual QA passed with no horizontal overflow.
- `npm run build:hosted` passed with beta single-user env.
- Netlify deploy completed.
- Live `/onboarding`, `/eligibility`, and `/api/health` returned `200 OK`.

## Recommended Next Work

Highest value next steps:

1. Make onboarding even more direct after first load.
   - Consider making the `Fill out basic info` button scroll smoothly to the embedded form.
   - Consider moving the basic info form higher on mobile if the status chrome takes too much vertical space.

2. Add durable hosted database.
   - Use `npm run hosted:db:prepare`, `npm run hosted:db:doctor`, and `npm run hosted:db:push`.
   - Then run migrations and source import against hosted DB.

3. Prove worker automation.
   - With hosted DB available, run a synthetic `file_claim` worker receipt.
   - Do not enable paid hands-off automation until this is proved.

4. Keep simplifying customer screens.
   - Dashboard, Eligibility, Review, Claims should be simple enough for a non-technical customer.
   - Push advanced detail into collapsed drawers or operator pages.

5. Re-check mobile.
   - User is sensitive to confusing UI. Always screenshot desktop and mobile after product flow changes.

## Safety / Legal Product Guardrails

Keep these in the product:

- ClaimBot is not legal advice.
- ClaimBot does not guarantee eligibility, approval, payout amount, or payout timing.
- ClaimBot uses user-provided facts only.
- Proof-required claims remain manual/review.
- Permission is required before claim categories can move forward.
- Shadow/review mode is the default.
- Claims should not be submitted automatically unless every guardrail is explicitly satisfied and live filing has been reviewed.

## Notes For Claude

- The user wants direct execution, not repeated permission prompts.
- The user wants customer-ready simplicity, not operator-console detail.
- The user likes Kimi’s visual design direction but wants Codex/Claude to wire the real code.
- Do not paste or request API keys in chat. Keep secrets in ignored env files or Netlify env only.
- If working on frontend, preserve the Kimi shell and existing visual language unless there is a strong product reason to change it.
