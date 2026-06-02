# Class Action Bot

Personal-first automation tool that tracks class action settlements, compares them with saved profile facts, and queues authorized review-ready claims for gated preflight. Architected from day one to scale into a multi-user SaaS.

## Quick Start

```bash
cd C:/Users/popon/classaction-bot
cp .env.example .env.local
npm install
npm run db:generate
npm run db:migrate
npm run scrape:once
npm run enrich:source
npm run source:export
npm run dev
```

Open `http://localhost:3100/goal` to start from the client-facing product objective.

`npm run scrape:once` now succeeds when at least one source loads records and
reports blocked sources as warnings. Use `npm run scrape:strict` when an
operator check should fail if any configured source is blocked.
Run `npm run enrich:source` after scraping to fetch official settlement pages
and conservatively fill administrator/deadline metadata from high-confidence
page text.
Run `npm run source:export` to write the enriched catalog to
`data/source-catalog-export.json` plus a matching `.sha256` receipt. A hosted database can then be bootstrapped with
`npm run hosted:db:prepare`, editing ignored `.env.hosted.local`, and running
`npm run with:hosted-env -- npm run source:import`. If the receipt exists,
import verifies it before reading the bundle. Use
`npm run with:hosted-env -- npm run source:import:dry` to validate the bundle
without changing the target database.
Run `npm run validate:source` after scraping; public-discovery previews fail
that check until source records and claim-form coverage are present. Run
`npm run validate:source:strict` before client-preview promotion to fail weak deadline,
administrator, or category coverage instead of treating those as advisory
warnings.

## Hosted Web App

This repo is configured for a hosted Next.js app on Netlify:

```bash
npm install
npm run hosted:checklist
npm run launch:handoff
npm run validate:secrets
npm run validate:netlify
npm run validate:ui
npm run validate:legal
npm run validate:pwa
npm run build:hosted
```

Netlify reads `netlify.toml`, validates hosted environment variables, runs migrations, builds the Next app, and publishes `.next` with its Next.js runtime. The `/goal` route is the client-facing product objective: find settlement claims that pertain to the user's real profile, keep proof-required claims in review, and queue only review-ready claims with active user authorization.

For production hosting, set these environment variables in Netlify or your host:

```text
DATABASE_URL=libsql://...        # use a persistent hosted database, not local file storage
DATABASE_AUTH_TOKEN=...           # or TURSO_AUTH_TOKEN for libSQL/Turso
CLAIM_FILER_MODE=shadow          # safe default; use live only after review
CLAIM_FILER_LIVE_ACK=             # set to reviewed only when live mode is intentionally enabled
CLAIM_FILER_MAX_PER_DAY=20
SCRAPER_USER_AGENT=ClaimBot/0.1 (+https://yourdomain.com/contact)
CLAIMBOT_SUPPORT_EMAIL=support@yourdomain.com
CLAIMBOT_DISABLE_AUTH=false       # do not disable hosted Identity for client deployments
CLAIMBOT_ENFORCE_CSP=true         # optional outside Netlify; Netlify sets NETLIFY=true automatically
CLAIMBOT_SESSION_SECRET=...       # long random value used to sign app sessions
CLAIMBOT_FEATURE_SETTLEMENT_SEARCH=true
CLAIMBOT_FEATURE_BREACH_IMPORT=true
CLAIMBOT_FEATURE_LIVE_FILING=false # keep live controls hidden until client review
CLAIMBOT_BILLING_PLUS_MONTHLY_URL=https://YOUR_PROCESSOR_CHECKOUT_LINK # hosted checkout link
CLAIMBOT_BILLING_PRO_MONTHLY_URL=https://YOUR_PROCESSOR_CHECKOUT_LINK  # hosted checkout link
CLAIMBOT_BILLING_SYNC_SECRET=PASTE_GENERATED_BILLING_SYNC_SECRET       # signs billing entitlement sync events
CLAIMBOT_STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_ENDPOINT_SECRET       # optional Stripe webhook endpoint secret
CLAIMBOT_LEGAL_REVIEW_ACK=                    # set to reviewed only after legal/compliance review
```

A placeholder-only hosted template is available at `.env.hosted.example`. Copy
from it into Netlify or your secret manager, not into git with real values.
For the full operator handoff, run `npm run hosted:env:prepare`. It creates
ignored `.env.hosted.local` from the hosted template, preserves existing
operator values, fills linked Netlify site metadata when available, and does
not print secret values. After editing placeholders, `npm run hosted:env:doctor`
checks the full one-file handoff without writing to Netlify. Then
`npm run hosted:env:push` sets launch-critical Netlify production and
deploy-preview environment values from `.env.hosted.local` plus generated
`.env.launch.local` secrets without printing them. For database-only launch
work, `npm run hosted:db:prepare` and `npm run hosted:db:push` remain available.
When validating a non-Netlify host, set `CLAIMBOT_ENFORCE_CSP=true`; the
committed `netlify.toml` headers only prove CSP for Netlify deploys.
Run `npm run launch:handoff` whenever another operator needs the current launch
state. It writes non-secret `data/launch-handoff-report.json` and
`data/launch-handoff-report.md` files with blockers, warnings, Netlify preview
readiness, source-catalog readiness, receipt readiness, and copy-ready
verification commands. The handoff loads non-placeholder values from ignored
`.env.launch.local` and `.env.hosted.local` before checking readiness, but only
writes counts, key names, URL shape labels, and redacted status.
The non-secret Netlify project setup receipt should also record that Identity is
enabled, registration is invite-only, and email confirmation is enabled before
client `/login` links are shared.
Install the Netlify CLI before linking, setting environment variables, deploying
previews, or promoting production deploys from this machine.

Copyable Netlify setup, with placeholders:

Generate ignored local launch smoke secrets first. This writes
`.env.launch.local`, preserves existing values, and does not print secrets:

```bash
npm run launch:secrets
```

Prepare and prove the hosted database through the ignored local env helper:

```bash
npm run hosted:env:prepare
# Edit .env.hosted.local with real database, support, billing, and legal-review values.
npm run hosted:env:doctor
npm run hosted:db:prepare
# Edit .env.hosted.local with the real hosted DATABASE_URL and auth token.
npm run hosted:db:doctor
npm run with:hosted-env -- npm run db:migrate
npm run with:hosted-env -- npm run validate:schema
npm run with:hosted-env -- npm run source:import:dry
npm run with:hosted-env -- npm run source:import
```

```bash
npm install -g netlify-cli
netlify --version
netlify login
netlify status
# If a confirmed existing ClaimBot Netlify site exists:
netlify link
# If no ClaimBot site exists yet, create a dedicated ClaimBot site first.
# Do not link this repo to an unrelated Netlify project.
npm run hosted:env:push
# Or use narrower/manual pushes:
npm run hosted:db:push
netlify env:set DATABASE_URL "libsql://YOUR_DATABASE.turso.io" --context production deploy-preview
netlify env:set DATABASE_AUTH_TOKEN "YOUR_DATABASE_TOKEN" --secret --context production deploy-preview
netlify env:set CLAIM_FILER_MODE "shadow" --context production deploy-preview
netlify env:set CLAIM_FILER_MAX_PER_DAY "20" --context production deploy-preview
netlify env:set SCRAPER_USER_AGENT "ClaimBot/0.1 (+https://yourdomain.com/contact)" --context production deploy-preview
netlify env:set CLAIMBOT_SUPPORT_EMAIL "support@yourdomain.com" --context production deploy-preview
netlify env:set CLAIMBOT_DISABLE_AUTH "false" --context production deploy-preview
netlify env:set CLAIMBOT_ENFORCE_CSP "true" --context production deploy-preview
npm run launch:push-secrets
netlify env:set CLAIMBOT_FEATURE_SETTLEMENT_SEARCH "true" --context production deploy-preview
netlify env:set CLAIMBOT_FEATURE_BREACH_IMPORT "true" --context production deploy-preview
netlify env:set CLAIMBOT_FEATURE_LIVE_FILING "false" --context production deploy-preview
netlify env:set CLAIMBOT_BILLING_PLUS_MONTHLY_URL "https://YOUR_PROCESSOR_CHECKOUT_LINK" --context production deploy-preview
netlify env:set CLAIMBOT_BILLING_PRO_MONTHLY_URL "https://YOUR_PROCESSOR_CHECKOUT_LINK" --context production deploy-preview
# Stripe alternative: set the Stripe endpoint secret instead of the custom ClaimBot sync secret.
netlify env:set CLAIMBOT_STRIPE_WEBHOOK_SECRET "whsec_YOUR_STRIPE_ENDPOINT_SECRET" --secret --context production deploy-preview
# Complete legal/compliance review before running this acknowledgement:
netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed" --context production deploy-preview
npm run validate:secrets
npm run validate:netlify
netlify dev:exec npm run validate:hosted
npm run validate:ui
npm run validate:legal
npm run validate:pwa
npm run build:hosted
netlify deploy
```

Use `npm run launch:handoff` and `npm run netlify:doctor` when local checks need
the same ignored operator files that will feed Netlify. Both commands load
non-placeholder values from `.env.launch.local` and `.env.hosted.local` before
checking readiness. Use
`npm run with:launch-secrets -- npm run netlify:doctor` as a fallback when you
only prepared launch smoke secrets. The doctor also checks whether
`.env.hosted.local` has non-placeholder hosted database values and the full
launch-critical hosted env handoff. It only prints key names, readiness counts,
URL shape/token presence, and next commands; it never prints database URLs,
checkout URLs, tokens, session secrets, or billing secrets.
Use `npm run hosted:env:doctor` before Netlify env pushes to confirm the full
one-file hosted env handoff no longer contains placeholders.
Use `npm run hosted:db:doctor` before hosted migrations, imports, or Netlify env
pushes to confirm `.env.hosted.local` no longer contains placeholders without
printing database secrets.
Use `npm run with:hosted-env -- <command>` when a migration, schema check, or
source import must target the hosted database without exporting secrets into the
shell history.

Before sending client `/login` links, enable Netlify Identity in
`Project configuration > Identity`. Use invite-only registration unless open
signup has been reviewed, keep email confirmation on for production accounts,
and test `/login` on a deployed preview because Identity is not available in
local development.
After confirming those dashboard settings, write the non-secret setup receipt:

```bash
npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard."
npm run launch:handoff
```

Hosted launch also requires a legal/compliance review acknowledgment. Review
the Terms, Privacy Policy, trust copy, proof handling, category authorization
gates, pricing, billing sync, and filing posture before setting
`CLAIMBOT_LEGAL_REVIEW_ACK=reviewed` in production.

Paid plan buttons use processor-hosted checkout links. Set the Plus and Pro
payment-link variables before relying on paid CTAs; ClaimBot does not handle
card data directly. Paid processors should call `/api/billing/entitlement-sync`
with the raw JSON body signed as `X-ClaimBot-Billing-Signature:
sha256=<hmac_sha256(raw_body, CLAIMBOT_BILLING_SYNC_SECRET)>`. If Stripe sends
webhooks directly, set `CLAIMBOT_STRIPE_WEBHOOK_SECRET` and let Stripe send its
standard `Stripe-Signature` header; ClaimBot verifies the raw body before JSON
parsing. The callback must include the processor event ID as `eventId` or a
Stripe-style top-level `id`. ClaimBot accepts direct ClaimBot payloads and
Stripe checkout-session style payloads with nested
`data.object.customer_details.email`, `data.object.payment_status`,
`data.object.customer`, `data.object.subscription`, and `metadata.plan_key`
values such as `plus_monthly` or `pro_monthly`. ClaimBot stores that event ID
in a unique `billing_events` ledger, so processor retries return as duplicate
replays without re-applying the entitlement or writing extra audit events. When the
processor checkout link accepts query metadata, ClaimBot appends
`claimbotUserId`, `clientReferenceId=claimbot_user_<id>`, and
`client_reference_id=claimbot_user_<id>` during the audited checkout handoff.
Carry one of those values into the signed callback so the entitlement links by
stable account before falling back to billing email. The database subscription
entitlement still controls whether paid automation can queue.

Run `npm run billing:receipt` to write a non-secret
`data/billing-sync-smoke-receipt.json`. It proves the ClaimBot HMAC signature,
Stripe-style signature, stable user reference parsing, plan/status normalization,
and event ID parsing contract without printing billing secrets or applying an
entitlement. The receipt supports the billing packet, but real checkout URLs and
a deployed processor callback are still required before paid launch.

Before shipping a preview or production deploy, run the local route smoke test against a running app:

```bash
npm run launch:handoff
npm run validate:pwa
npm run validate:ui
npm run validate:secrets
npm run validate:hosted
npm run validate:legal
npm run validate:source
npm run enrich:source
npm run source:export
npm run validate:source:strict
npm run hosted:db:prepare
# Edit .env.hosted.local with the hosted database values, then:
npm run hosted:db:doctor
npm run with:hosted-env -- npm run source:import:dry
npm run with:hosted-env -- npm run source:import
npm run dev
npm run smoke:hosted:local
```

When route smokes need to start local development servers, use the orchestrated
local command:

```bash
npm run smoke:hosted:local
```

That command starts a fresh web-smoke target on `SMOKE_HOSTED_LOCAL_WEB_PORT`
or `3105`, runs `smoke:web` against it, shuts it down, then runs `smoke:auth`
and `smoke:features` on their isolated local ports. Running `smoke:web`,
`smoke:auth`, and `smoke:features` in parallel can create port and startup
contention. Parallel runs are only reasonable when all three target an already
deployed preview through `SMOKE_BASE_URL`.
For production-like cache-header assertions against a local target, set
`SMOKE_STRICT_CACHE_HEADERS=1`; plain Next dev may add its own `no-store,
must-revalidate` header to public pages even when ClaimBot middleware leaves
those routes cacheable for hosted deployment.

For one local preflight that includes source enrichment, strict source quality,
route smokes, and a production build, keep the dev server running on port 3100
and run:

```bash
npm run preview:gate:local
```

The auth smoke exercises the hosted Identity route gate locally. It starts an
isolated auth-required dev server unless `SMOKE_BASE_URL` points at a deployed URL:

The auth smoke verifies protected pages redirect to `/login`, public legal/PWA
assets stay reachable, protected APIs return `401`, and fake bearer headers do
not bypass the Identity cookie gate. On deployed previews it also probes
`/.netlify/identity/user` and expects Netlify Identity to reject the anonymous
request instead of returning a missing or app-rendered route. It also verifies a
signed app session can reach protected routes.

For a deployed preview, point it at the preview URL:

```bash
$env:SMOKE_BASE_URL="https://your-preview.netlify.app"
$env:NETLIFY_SITE_SLUG="YOUR_CONFIRMED_CLAIMBOT_SITE_SLUG"
$env:CLAIMBOT_SESSION_SECRET="PASTE_THE_DEPLOYED_SESSION_SECRET"
$env:CLAIMBOT_BILLING_SYNC_SECRET="PASTE_THE_DEPLOYED_BILLING_SYNC_SECRET"
# Or, for native Stripe webhooks:
$env:CLAIMBOT_STRIPE_WEBHOOK_SECRET="whsec_YOUR_STRIPE_ENDPOINT_SECRET"
npm run smoke:web
npm run smoke:auth
npm run smoke:features
npm run preview:check-env
npm run validate:netlify:strict
npm run preview:gate
npm run production:check-receipt
```

The launch-critical `netlify env:set` commands intentionally target both
`production` and `deploy-preview` contexts. Netlify deploy contexts can carry
different environment values, so the deployed preview must prove the same
database, auth, billing, legal, and feature-flag gates before production
promotion.

The deployed auth and feature-flag smokes sign temporary local test cookies, so
`CLAIMBOT_SESSION_SECRET` must match the secret configured on the preview. The
auth smoke also signs a synthetic processor callback, so
`CLAIMBOT_BILLING_SYNC_SECRET` or `CLAIMBOT_STRIPE_WEBHOOK_SECRET` must match the
preview billing verifier. Keep both values in the local terminal session only;
do not commit them or paste them into client pages. The deployed auth smoke also
exports `/api/audit/support-packet` and fails if the hosted database has not
loaded a source catalog with claim-form and source-quality readiness. The same
support packet includes `launchEvidence.netlifyPreview`, which records only
non-secret readiness for the linked ClaimBot Netlify site and labels which
preview-gate checks are server-observable. HTTPS `SMOKE_BASE_URL`, the session
smoke secret, and the billing/Stripe smoke verifier are operator-local terminal
inputs, so `validate:netlify:strict` and `preview:gate` are still the authority
for those values. The deployed feature smoke reads `/api/profile/bootstrap`
first, then adapts its checks to the preview's active settlement-search and
breach-import feature posture.

`npm run validate:netlify` is an advisory local check for Netlify config and
site-link state. `npm run validate:netlify:strict` is the deployed-preview
version. Both commands load non-placeholder values from ignored
`.env.launch.local` and `.env.hosted.local` before checking, and only print
readiness messages. Strict mode fails until a Netlify site is linked or
`NETLIFY_SITE_ID` / `SITE_ID` is set, `SMOKE_BASE_URL` points at an HTTPS
preview URL, and the smoke secrets are present.

`npm run preview:check-env` runs only the fast deployed-preview input check,
rejecting copied placeholders, missing Netlify site targeting, preview URLs that do not match the confirmed Netlify site slug, and malformed preview secrets before the heavier
gate starts. `npm run preview:gate` refuses to run until the deployed preview URL, hosted
database, billing links, billing sync secret, legal review acknowledgment,
support contact, scraper contact, session secret, and a linked Netlify site
are present in the local operator environment. The preview gate loads
non-placeholder values from ignored `.env.launch.local` and `.env.hosted.local`
first and only prints readiness counts/messages, never raw env values. Run
`netlify login` and `netlify link`
before preview promotion, or set `NETLIFY_SITE_ID` / `SITE_ID` in CI after
confirming the site belongs to ClaimBot. Do not reuse unrelated Netlify
projects for this app. The gate also runs strict source-catalog validation,
`source:export`, and then `source:import:dry` against the target database, so keep
`data/source-catalog-export.json` available on the operator machine before production promotion. A successful deployed-preview gate writes
`data/preview-promotion-receipt.json`, a non-secret receipt with the preview URL,
confirmed Netlify site slug, gate command list, timestamp, and source-catalog
digest when available. Use `npm run production:check-receipt` as the final
pre-production gate after `netlify deploy` and before `netlify deploy --prod`.
The in-app `/launch` checklist uses the same strict source-catalog readiness,
so client preview stays blocked until settlement discovery, claim-form coverage,
and source quality are represented in launch evidence.
For the optional Netlify dashboard shortcut in `/launch`, set
`NETLIFY_SITE_DASHBOARD_URL` or `NETLIFY_SITE_SLUG`; do not use a site UUID as a
dashboard URL unless Netlify has given you that exact link.

After preview smokes pass, promote the reviewed deploy:

```bash
npm run production:check-receipt
netlify deploy --prod
```

`npm run validate:hosted` fails deployment when:

- `DATABASE_URL` is missing or points to `file:` storage in hosted mode.
- `libsql://` is used without `DATABASE_AUTH_TOKEN` or `TURSO_AUTH_TOKEN`.
- `CLAIM_FILER_MODE` is not `shadow` or `live`.
- `CLAIM_FILER_MODE=live` is set without `CLAIM_FILER_LIVE_ACK=reviewed`.
- `CLAIM_FILER_MAX_PER_DAY` is outside `1..100`.
- `CLAIMBOT_FEATURE_SETTLEMENT_SEARCH=false` would hide the core claim-discovery path.
- `CLAIMBOT_DISABLE_AUTH=true` is set in hosted deployment.
- `CLAIMBOT_SESSION_SECRET` is missing or shorter than 32 characters.
- `SCRAPER_USER_AGENT` is missing a contact URL in hosted deployment.
- `CLAIMBOT_SUPPORT_EMAIL` is missing for client and site-operator support.
- CSP is not enforced through Netlify or `CLAIMBOT_ENFORCE_CSP=true`.
- paid billing gates are missing Plus checkout, Pro checkout, or both billing webhook verifiers.
- `CLAIMBOT_LEGAL_REVIEW_ACK=reviewed` is missing after legal/compliance review.

Hosted deployments protect app routes and mutation APIs with Netlify Identity.
Enable Identity on the Netlify site before inviting clients, then verify the
deployed `/login` flow before production promotion. Local development remains
open by default; set `CLAIMBOT_REQUIRE_AUTH=true` to exercise the route gate
locally after deploying Identity. Netlify Identity tokens are exchanged for a
signed, HttpOnly `claimbot_session` cookie; protected routes do not trust a bare
`nf_jwt` cookie.

The in-app settings form enforces the same posture for runtime changes: saving `live`
mode requires an explicit live-mode acknowledgement, and switching back to `shadow`
clears that acknowledgement.

Client feature flags let a preview deployment hide settlement search, breach intake,
or live filing controls without code changes. The API also rejects disabled settlement
search, breach intake, and live-mode settings requests so hidden controls are not the
only protection.

The hosted web app should be the client product. Keep browser-heavy automation and scheduled jobs in a worker process until they are moved to a production-safe queue or scheduled-function setup. Paid commands are full guarded automation for eligible no-proof claims: buttons create audited `file_claim` jobs, then the verified worker continues without per-claim user clicks. Proof-required, uncertain, unauthorized, form-missing, launch-locked, preflight-failed, legal-review-blocked, or disabled-live-filing cases are hard stops, not semi-automated paid chores. Those jobs are not considered launch-ready unless a separate worker runtime is verified.

For hosted paid automation, run one of these outside the web request path with the same hosted `DATABASE_URL` and auth token:

```bash
npm run worker
# or from an external scheduler / worker smoke:
npm run worker:once
```

The repo also includes a deployable GitHub Actions scheduler at
`.github/workflows/claimbot-worker.yml`. Add the hosted `DATABASE_URL` secret,
add `DATABASE_AUTH_TOKEN` or `TURSO_AUTH_TOKEN` when the database provider needs
one, set the worker variables, then run the non-secret doctor before relying on
its 5-minute schedule:

```bash
npm run worker:github:doctor
gh secret set DATABASE_URL
# If DATABASE_URL is libsql://, set one database auth token secret:
gh secret set DATABASE_AUTH_TOKEN
# Or:
gh secret set TURSO_AUTH_TOKEN
gh variable set CLAIM_FILER_MODE --body "shadow"
gh variable set CLAIM_FILER_MAX_PER_DAY --body "20"
gh variable set SCRAPER_USER_AGENT --body "ClaimBot/0.1 (+https://yourdomain.com/contact)"
gh variable set CLAIMBOT_SUPPORT_EMAIL --body "support@yourdomain.com"
gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"
npm run worker:github:doctor
gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true
```

Each worker smoke writes a non-secret `data/worker-smoke-receipt.json`; the
GitHub Actions workflow uploads that receipt as the `claimbot-worker-smoke-receipt`
artifact. When `seed_smoke_job=true`, it also uploads
`claimbot-worker-file-claim-smoke-seed`. Preserve both artifacts before setting
the launch receipt flags. Do not set `CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified`
until the uploaded worker smoke receipt shows `launchProofUsable=true`,
`file_claim` succeeded greater than zero, `failed=0`, and `retried=0` against
hosted storage.

After a worker smoke proves jobs are processed automatically, record the non-secret runtime proof in the hosted environment:

```text
CLAIMBOT_WORKER_RUNTIME=scheduled-worker
CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified
```

`npm run validate:hosted` and the launch handoff fail until this worker-runtime proof is present.

Before inviting clients, publish a retention policy for profile facts, evidence
references, screenshots, form-preparation artifacts, support packets, and audit
records. The public Privacy Policy and Terms include the expected export,
correction, and deletion request boundary; align the operator support process
with that text. Signed-in users can download a digest-backed account data export
from `/api/privacy/export`; correction and deletion still route through support
so required audit, fraud-prevention, legal, or accounting records can be scoped
instead of silently erased. Signed-in users can also submit a structured privacy
request through `/api/privacy/request`, which records an audit event for operator
review without performing destructive deletion automatically.

### Health Check

The hosted app exposes a non-secret operational endpoint:

```text
/api/health
```

It verifies database reachability, reports the current filing mode, and confirms whether shadow mode is active. It does not expose secrets, tokens, user counts, claim counts, audit counts, claim payloads, attestation text, or user profile fields.

## PWA Behavior

ClaimBot ships a conservative service worker for installability and a branded offline page. It caches only the static shell assets needed to show offline state:

- `/offline.html`
- `/manifest.webmanifest`
- `/icon.svg`

The service worker intentionally does not cache `/api/*` or `/claims/*` responses. Claim data, match-review state, authorization records, and preflight status should be read from the live app rather than stored for offline use.

Run `npm run validate:pwa` before hosted previews. It checks the manifest,
offline page, service worker cache boundaries, root registration, and Netlify
headers for `/sw.js` and `/manifest.webmanifest`.

The offline page is intentionally not a usable claim workspace. It must continue
to say that claim records, offline filing, and legal decisions are unavailable
while disconnected. If you change the service worker or offline shell, rerun
`npm run validate:pwa` and the browser smoke tests before inviting clients.

## Kimi Design Workflow

Kimi can be used as a design director without committing secrets:

```bash
$env:KIMI_API_KEY="your-rotated-key"
npm run design:kimi
```

`MOONSHOT_API_KEY` is also accepted if your provider dashboard uses that name.
Keep the key in `.env.local` or your shell environment, not in committed files.
Run `npm run validate:secrets` before sharing or deploying work if a key was
pasted into the local workspace during design iteration.
`kimi-k2.6` is available on Moonshot accounts, but it can spend short capped
runs on reasoning and return no visible design text. `moonshot-v1-32k` is the
script default and recommended model for design briefs.

The script sends the current `/goal` page, layout, CSS, and README context to Kimi's OpenAI-compatible API and writes the result to:

```text
docs/kimi-design-brief.md
```

If OpenClaw has a working Moonshot/Kimi auth profile on this computer, you can
route the design brief through OpenClaw instead:

```bash
npm run design:kimi:openclaw -- "Give focused onboarding and /goal page guidance"
```

Use a rotated key. Do not commit API keys to the repo.

## Windows Desktop Exe

Build a portable Windows executable:

```bash
cd C:/Users/popon/classaction-bot
npm run dist:win
```

The portable app is written to:

```text
dist/Class Action Bot-0.1.0-x64.exe
```

The desktop app stores its SQLite database, browser profiles, and evidence files under:

```text
%APPDATA%/classaction-bot/data
```

The packaged launcher starts the Next.js standalone server, runs database migrations, starts the background worker, then opens the desktop window. Claim filing defaults to `shadow` mode unless the app setting or `CLAIM_FILER_MODE=live` explicitly enables live submission.

## Production

```bash
pm2 start ecosystem.config.cjs
pm2 logs classaction-worker
```

This starts two processes:

- `classaction-web` - Next.js on `:3100`
- `classaction-worker` - node-cron scheduled scraping plus jobs poller

## Legal Posture

See [LEGAL.md](./LEGAL.md). Short version: this tool never supports claims where the saved profile facts do not meet the class definition. It applies attested profile facts to forms; it does not fabricate eligibility. Shadow mode is the default; flip `CLAIM_FILER_MODE=live` only after manual verification per administrator.

## File Map

- `src/db/schema.ts` - every legal safeguard lives here
- `src/lib/scraper/normalize.ts` - canonical key and dedup logic
- `src/lib/scraper/ingest.ts` - scraper orchestrator called by cron
- `src/lib/claim-filer/preflight.ts` - proof, authorization, confidence, and rate-limit gate
- `worker/index.ts` - PM2 entrypoint
- `src/app/settlements/` - discovery and match-review UI
