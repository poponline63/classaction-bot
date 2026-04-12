# Class Action Bot

Personal-first automation tool that tracks class action settlements, matches them against your eligibility profile, and auto-submits claim forms for pre-authorized categories. Architected from day one to scale into a multi-user SaaS.

## Phase 1 status: Discover

Phase 1 (scrape + store + display) is scaffolded. See `C:\Users\Administrator\.claude\plans\sorted-giggling-toucan.md` for the full plan.

## Quick start

```bash
cd C:/Users/Administrator/.openclaw/workspace/classaction-bot
cp .env.example .env.local
npm install
npm run db:generate        # emit SQL migrations from schema.ts
npm run db:migrate         # apply migrations + seed single user
npm run scrape:once        # one-shot scrape (dev sanity check)
npm run dev                # next dev on :3100
```

Open http://localhost:3100/settlements to browse discovered settlements.

## Production (PM2)

```bash
pm2 start ecosystem.config.cjs
pm2 logs classaction-worker
```

This starts two processes:
- `classaction-web` — Next.js on :3100
- `classaction-worker` — node-cron (03:15 scrape) + jobs poller

## Legal posture

See [LEGAL.md](./LEGAL.md). Short version: this tool NEVER files claims where you don't meet the class definition. It applies your attested eligibility profile to forms — it does not fabricate it. Shadow mode is the default; flip `CLAIM_FILER_MODE=live` only after manual verification per administrator.

## File map

- `src/db/schema.ts` — every legal safeguard lives here
- `src/lib/scraper/normalize.ts` — canonical key / dedup logic (unit-tested)
- `src/lib/scraper/ingest.ts` — orchestrator called by cron
- `worker/index.ts` — PM2 entrypoint
- `src/app/settlements/` — read-only UI

## Phase 2+ stubs

Schema tables for profile, purchases, data_breach_exposure, class_authorizations, matches, claims, form_templates already exist in `schema.ts` so drizzle-kit generates a single migration from day one.
