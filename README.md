# IPOBharosa

An IPO board for Indian retail investors — lot size, price band, subscription, and grey market premium (GMP), with honest source confidence instead of blind numbers.

New contributors and coding agents should start with the canonical
[`docs/AGENT_HANDOFF.md`](docs/AGENT_HANDOFF.md). It contains the current
Production evidence, architecture, source policy, completed work, launch gaps
and safety rails.

## Why

GMP is informal, unregulated dealer-street pricing — no official source exists
anywhere. IPOBharosa stores source-level observations and, when launch-approved
providers are available, aggregates them with median, spread and an explicit
confidence tier. Unapproved sources remain disabled; missing GMP is explained
honestly instead of being replaced with a stale or fabricated number.

See [`docs/EXECPLAN.md`](docs/EXECPLAN.md) for the verified current state,
release workflow, and small-PR delivery sequence.

## Stack

- Next.js (App Router, TypeScript)
- PostgreSQL (Neon, via Vercel) + Prisma 7 (driver adapter: `@prisma/adapter-pg`)
- Vitest for ingestion/normalization logic

## Mobile app

A companion Expo / React Native app for Android + iOS lives in
[`mobile/`](mobile/README.md). It reads the public board API
(`GET /api/public/board`), stores PAN cards locally on-device, and checks
allotment via official registrar endpoints (MUFG/Link Intime) or official
registrar portal links for CAPTCHA-gated registrars.

## Getting started

```bash
npm ci
npm run db:migrate:deploy
npm run db:seed:dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Vitest suite |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm run check` | Lint, tests, and production build |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:migrate:deploy` | Apply committed migrations |
| `npm run db:seed:dev` | Seed deterministic Development data |
| `npm run smoke:preview -- <url>` | Smoke-test a deployed PR Preview |

## Release workflow

- `main` is Production. Do not commit feature work directly to it.
- Create one short-lived branch and one small pull request per concern.
- Every pull request must pass CI and receive a Vercel Preview backed by the
  isolated Development database.
- Test the affected frontend states, backend success/failure paths, responsive
  layouts, and migrations on Preview. Attach the URL and evidence to the PR.
- Merge only after the Preview is verified. Then perform read-only Production
  smoke checks on the reviewed commit.

Preview must never receive Production database credentials, personal data, or
live email delivery credentials.

## Site and email configuration

All public links share one validated origin. Set `NEXT_PUBLIC_SITE_URL` and,
optionally, `SITE_URL` to the same origin (HTTPS outside localhost). GitHub
Actions may use the repository variable `SITE_URL`; it falls back to the public
Vercel alias until a custom domain is connected.

User-facing email sign-in and watchlist reminders remain hidden unless every
setting below is present:

```text
EMAIL_USER_FEATURES_ENABLED=true
RESEND_API_KEY=<secret>
AUTH_EMAIL_FROM=IPOBharosa <hello@verified-sender-domain>
NEXT_PUBLIC_SITE_URL=https://your-production-domain
```

Google sign-in remains available when user email features are held. The admin
dashboard reports only configuration presence and never displays secret values.

## Pipeline Monitoring

The ingestion pipeline runs on a schedule via [cron-job.org](https://cron-job.org) (free, no billing required). It discovers new IPOs, fetches GMP/subscription data, and syncs official BSE/NSE filings.

### Cron Jobs (cron-job.org)

| Job ID | Name | Schedule | Endpoint |
|--------|------|----------|----------|
| 8314076 | Ingest | Every hour | `trigger?jobs=ingest` |
| 8314080 | Allotment | Every 2 hours | `trigger?jobs=allotment` |
| 8314075 | Push+Filings+Catalogues | Daily 9am IST | `trigger?jobs=push,filings,catalogues` |

**Dashboard:** https://dashboard.cron-job.org → Login → Jobs

### Monitoring Commands

**Check latest pipeline run:**
```bash
# Via health endpoint (no auth needed)
curl -s https://ipobharosa.vercel.app/api/health | python3 -m json.tool

# Via trigger endpoint (shows last run status)
curl -s "https://ipobharosa.vercel.app/api/cron/trigger?jobs=ingest" | python3 -m json.tool
```

**Check pipeline status from database:**
```bash
export DATABASE_URL='postgresql://aish:H9XWGh7G_8rBrowv6F0Byw@small-chirper-32604.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full&sslrootcert=$HOME/.postgresql/root.crt'

# Latest run summary
node -e "
const pg = require('pg');
const os = require('os');
const connStr = process.env.DATABASE_URL.replace('\$HOME', os.homedir());
const client = new pg.Client({ connectionString: connStr });
client.connect().then(async () => {
  const { rows } = await client.query('SELECT id::text, ok, summary::text, error, \"startedAt\"::text, \"finishedAt\"::text FROM \"IngestionRun\" ORDER BY \"startedAt\" DESC LIMIT 1');
  const s = JSON.parse(rows[0].summary);
  console.log('Run:', rows[0].id.substring(0,8));
  console.log('Status:', rows[0].ok ? '✅ OK' : '❌ FAILED');
  console.log('Stage:', s.stage);
  console.log('Started:', rows[0].startedAt);
  console.log('Finished:', rows[0].finishedAt || 'still running...');
  console.log('Discovery:', JSON.stringify(s.summary.discovery));
  console.log('GMP:', JSON.stringify(s.summary.gmp));
  console.log('Subscription:', JSON.stringify(s.summary.subscription));
  console.log('IPO Count:', s.summary.ipoCount);
  if (rows[0].error) console.log('Error:', rows[0].error);
  client.end();
});
"
```

**Count IPOs by status:**
```bash
node -e "
const pg = require('pg');
const os = require('os');
const connStr = process.env.DATABASE_URL.replace('\$HOME', os.homedir());
const client = new pg.Client({ connectionString: connStr });
client.connect().then(async () => {
  const { rows } = await client.query('SELECT status, \"publicationState\", COUNT(*) as c FROM \"Ipo\" GROUP BY status, \"publicationState\" ORDER BY c DESC');
  rows.forEach(r => console.log(r.status, r.publicationState, ':', r.c));
  client.end();
});
"
```

### Pipeline Stages

```
prepare → catalogue → discovery → revalidation → publishedRevalidation → gmp → subscription → finalize → complete
```

| Stage | What it does | Typical duration |
|-------|-------------|-----------------|
| prepare | Sync IPO statuses and listings | ~1s |
| catalogue | Fetch SEBI filing catalogue | ~24s |
| discovery | Discover new IPOs from ipowatch.in | ~47s |
| revalidation | Recheck DRAFT IPOs against official sources | ~9s |
| publishedRevalidation | Verify PUBLISHED IPOs for data drift | ~26s |
| gmp | Fetch GMP data from 5 adapters | ~10s |
| subscription | Fetch NSE subscription data | ~5s |
| finalize | Mark pipeline complete | <1s |

**Note:** Pipeline completes in 2 cron triggers due to Vercel's 120s timeout. Checkpoint persists after each stage, so it resumes automatically.

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `skippedDueToLock: true` | Another pipeline run is active | Wait for current run to finish |
| `fetchFailed` in discovery | ipowatch.in detail page timeout | Auto-retries with exponential backoff |
| `QUARANTINED` IPOs | Official data conflicts with discovery | Review in admin dashboard |
| `draftsCreated: 0` | All candidates already tracked or auto-published | Normal — auto-published IPOs don't count as drafts |
| Pipeline timeout | Vercel 120s limit | Checkpoint saved, resumes on next trigger |

### Admin Dashboard

- **URL:** https://ipobharosa.vercel.app/admin
- **Auth:** Requires admin email (aish.iiitb@gmail.com)
- **Features:** Review quarantined IPOs, approve/reject, view drift incidents, manage publication state

### Vercel Dashboard

- **Project:** https://vercel.com/aishuo07s-projects/ipobharosa
- **Logs:** https://vercel.com/aishuo07s-projects/ipobharosa/deployments (click latest → Logs)
- **Cron Jobs:** Disabled on Vercel (using cron-job.org instead)
