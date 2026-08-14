# IPOBharosa

An IPO board for Indian retail investors — lot size, price band, subscription, and grey market premium (GMP), with honest source confidence instead of blind numbers.

## Why

GMP is informal, unregulated dealer-street pricing — no official source exists anywhere. Every existing tracker shows it as a single number with false confidence. IPOBharosa scrapes multiple independent public GMP sources, aggregates with median + spread, and surfaces a confidence tier (High/Medium/Low) driven by how many sources agree and how far apart they are. A failing source degrades confidence; it never breaks the pipeline.

See [`docs/EXECPLAN.md`](docs/EXECPLAN.md) for the verified current state,
release workflow, and small-PR delivery sequence.

## Stack

- Next.js (App Router, TypeScript)
- PostgreSQL (Neon, via Vercel) + Prisma 7 (driver adapter: `@prisma/adapter-pg`)
- Vitest for ingestion/normalization logic

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
