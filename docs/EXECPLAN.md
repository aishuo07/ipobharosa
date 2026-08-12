# Make IPOBharosa changes verifiable before production

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with the ExecPlan requirements and guidelines in the `execution-plan` skill.

## Purpose / Big Picture

IPOBharosa currently deploys every commit on `main` directly to Production. The goal of this plan is to make every change observable before it can affect users: a small pull request gets automated checks, an isolated Preview database, a Vercel Preview deployment where both frontend and backend can be exercised, human verification evidence, and only then a merge to Production. The same process covers UI work, ingestion, financial verification, domain/email readiness, and the future IPO application integration.

## Progress

- [x] (2026-08-12 15:00 IST) Audited the repository, production database aggregates, GitHub Actions history, Vercel variables, tests, lint, and production build.
- [x] (2026-08-12 15:20 IST) Created `codex/release-foundation`; no feature work will be committed directly to `main`.
- [x] (2026-08-12 15:35 IST) Created an empty `ipobharosa_dev` PostgreSQL database and changed the Vercel Preview and Development `DATABASE_URL` values so Preview no longer points at Production.
- [x] (2026-08-12 15:45 IST) Added pull-request CI for lint, unit tests, Prisma validation, production build, clean migration deployment, and migration/schema drift detection.
- [x] (2026-08-12 15:50 IST) Removed the hard-coded admin bearer-token fallback and stopped exposing a token example through the extraction health endpoint.
- [x] (2026-08-12 15:55 IST) Changed financial candidates so parser confidence can never bypass human review.
- [x] (2026-08-12 15:25 IST) Added and clean-database-tested the missing committed Prisma migration from the initial schema to the current schema.
- [x] (2026-08-12 15:30 IST) Applied committed migrations and deterministic seed data twice to `ipobharosa_dev`; the second run preserved 6 companies and 6 IPOs without duplicates. Production remained unchanged.
- [x] (2026-08-12 16:00 IST) Pushed the release-foundation branch, opened PR #1, passed CI and clean-migration checks, deployed an isolated Vercel Preview, ran frontend/backend smoke checks, and verified responsive overflow at five viewports. The PR remains intentionally unmerged for human approval.
- [x] (2026-08-12 16:30 IST) Merged PR #1, created a seven-day Neon point-in-time backup branch, aligned the one missing Production column default, confirmed zero schema drift, marked `20260812152000_release_foundation` as already applied without replaying SQL, and verified all Production row counts were unchanged.
- [x] (2026-08-12 16:32 IST) Reassigned `ipobharosa.vercel.app` from the stale Vercel project deployment to the merged `bbfa64a` Production deployment and passed the complete smoke suite through the canonical alias.
- [ ] Split the ingestion process so a scheduled run completes below the Vercel function limit; verify three consecutive successful Development runs.
- [ ] Port the standalone IPOBharosa design-system artifact into code tokens and reusable components, then update Board and IPO Detail in separate PRs.
- [ ] Implement official-document ingestion and checksum storage, then native PDF table extraction, OCR fallback, human review, and public read migration in separate PRs.
- [ ] Buy and connect `ipobharosa.com`, verify Resend DNS, test Google and email authentication, and complete one real watchlist-reminder journey.
- [ ] Add the provider-neutral IPO application demo only after the discovery/financial/release foundations are stable; keep live submission disabled until Codifi or ODIN grants sandbox access and confirms the compliance model.

## Surprises & Discoveries

- Observation: the repository had no pull requests at audit time and `main` was the only branch; Vercel created a Production deployment for every recent commit.
  Evidence: `gh pr list --state all` returned an empty list and recent deployment records all had environment `Production`.
- Observation: the claimed 121 tests are real, but they did not make the repository release-clean.
  Evidence: `npm test` reported 121 passing tests, `npm run build` passed, and `npm run lint` failed on the financial extraction route.
- Observation: Preview and Production used the same database before this plan.
  Evidence: Vercel environment comparison reported equal `DATABASE_URL` values for Preview and Production. Preview has now been changed to `ipobharosa_dev`.
- Observation: current production migrations are not reproducible from the repository.
  Evidence: the production database contains financial, reminder, discovery, and ingestion tables while `_prisma_migrations` contains only `20260811134018_init`; those later objects are absent from that migration file.
- Observation: the automated financial extractor is a stub.
  Evidence: `src/lib/financials/pdf-extraction.ts` always returns no extractions and the batch function returns an empty array.
- Observation: production contains 41 IPOs, 461 GMP snapshots, 99 subscription snapshots, and 18 legacy financial rows, but zero `FinancialDocument`, `FinancialExtraction`, and `FinancialPublished` rows.
- Observation: the current public UI reads `FinancialSnapshot`, not the new `FinancialPublished` model.
  Evidence: `src/lib/board-data.ts` includes and shapes only `financialSnapshots`.
- Observation: the scheduled ingestion is currently unhealthy.
  Evidence: the latest two GitHub Actions runs returned HTTP 504 with `FUNCTION_INVOCATION_TIMEOUT` after about 60 seconds.
- Observation: production has one user and zero watchlist items, so watchlist reminder delivery has not been demonstrated by a real user journey.
- Observation: after PR #1 merged, the canonical `ipobharosa.vercel.app` alias still resolved to an older deployment from the `ipodekho` Vercel project, while the merged deployment lived in the `ipobharosa` project.
  Evidence: the old alias returned 404 for `/api/admin/extract-all-financials`; after assigning it to deployment `dpl_4Cy1fMBjCF1et1Y57AYynxY1UguD`, the full smoke suite passed.
- Observation: the Production schema was structurally complete except for the database default on `Ipo.discoveredFrom`.
  Evidence: Prisma drift reported only `default changed from None to Some(Value(List([])))`; after setting `ARRAY[]::text[]`, `prisma migrate diff` reported `No difference detected`.
- Observation: while this branch was being prepared, `main` received a direct automated-extractor commit containing a fallback bearer token and guessed financial context.
  Evidence: commit `36b2a2c` defaulted the token to `dev-token-123`, invented a virtual document URL, and defaulted fiscal period, scope, and audit status. The release-foundation branch rebased it, removed the fallback, required real document evidence, disabled submission by default, and kept all candidates behind human review.
- Observation: the first pull-request run failed before application tests because the lockfile was incomplete and a fresh Vercel clone did not generate Prisma Client.
  Evidence: GitHub reported missing `@emnapi` packages during `npm ci`; Vercel could not resolve `src/generated/prisma/client`. The branch now repairs the lockfile and runs `prisma generate` during `postinstall` so clean environments behave like local development.
- Observation: responsive Preview inspection found a 23-pixel horizontal overflow on the mobile IPO detail page.
  Evidence: at 390 CSS pixels the registrar call-to-action extended to x=414. The mobile button now wraps within the panel instead of expanding it.

## Decision Log

- Decision: use short-lived feature branches and pull requests targeting `main`; do not create a permanently deployed `develop` branch.
  Rationale: Vercel already creates one Preview per pull request. A long-lived branch would add merge drift without improving validation. Environment separation is data/secrets separation, not a second source-of-truth branch.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: Production deploys only from `main`; each pull request must pass CI, Vercel Preview, backend smoke tests, and human UI review before merge.
  Rationale: this directly prevents the prior blind-merge behavior.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: Preview uses a separate empty database and does not copy Production users, sessions, PAN, demat, UPI, watchlists, or other personal data.
  Rationale: Preview code must be safe to mutate and accessible test data must not contain personal information.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: financial extraction confidence never auto-publishes a value.
  Rationale: OCR/parser confidence measures extraction mechanics, not whether the correct consolidated/restated table and fiscal period were chosen.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: the current financial pipeline is classified as a partial review framework, not production-ready automated verification.
  Rationale: the extractor is empty, new pipeline tables contain no data, and the public UI still reads the legacy table.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: live IPO order submission remains out of scope until a provider grants sandbox credentials and confirms external-dematerialized-account, applicant-owned-UPI, consent, and intermediary requirements.
  Rationale: provider-neutral mock UX is reversible; accepting real PAN/demat/UPI or submitting orders without a supported compliance path is not.
  Date/Author: 2026-08-12 / Codex and Aish.
- Decision: baseline the existing Production schema with `prisma migrate resolve --applied`, never `prisma migrate deploy` for `20260812152000_release_foundation`.
  Rationale: Production already contained the migration's tables and columns. Replaying creation SQL would collide; recording the migration only after a backup and zero-drift proof preserves data and makes future migrations reproducible.
  Date/Author: 2026-08-12 / Codex and Aish.

## Outcomes & Retrospective

The release foundation is complete. PR #1 passed CI and Preview review, merged as `bbfa64a`, and deployed successfully. Production now has a recoverable Neon backup branch, both committed migrations recorded as applied, zero Prisma schema drift, unchanged data counts, and a canonical URL that resolves to the reviewed deployment. The next milestone is the bounded, restartable ingestion repair tracked in issue #2.

## Context and Orientation

The repository is `aishuo07/ipobharosa`, a private Next.js 16 application deployed by Vercel. `src/app` contains pages and route handlers, `src/components/IpoBoard.tsx` contains most board and detail UI, `src/lib/ingestion` orchestrates the scheduled data pipeline, and `prisma/schema.prisma` defines PostgreSQL data. GitHub Actions calls `GET /api/cron/ingest` every two hours. A Preview is Vercel's temporary deployment for a non-main branch; Production is the stable deployment built from `main`.

The standalone design-system reference is stored outside this repository at `/Users/aikanodi/saia-service/IPOBharosa-Design-System.html`. It is a specification artifact, not proof that the application implements all tokens, components, interactions, transitions, accessibility rules, or responsive states.

## Plan of Work

Milestone 1 makes the current system reproducible and safe. Commit all schema evolution as migrations, remove development fallbacks from production endpoints, make lint/tests/build/migration checks mandatory, isolate Preview data, and demonstrate the entire change on a pull-request Preview. Production remains untouched until the Preview evidence is accepted.

Milestone 2 repairs ingestion reliability. Profile the 60-second timeout, stop doing all network sources and all IPO writes sequentially in one serverless request, process bounded batches with durable checkpoints, and make scheduled retries idempotent. Acceptance requires three consecutive Development cycles below the configured timeout with persisted summaries and no duplicate snapshots.

Milestone 3 implements the visual system, split into two pull requests. First add code-level tokens and reusable primitives with responsive, keyboard, focus, reduced-motion, loading, empty, error, and disabled states. Then migrate the Board and IPO Detail pages. The Vercel Preview must be checked at 360, 390, 768, 1024, and 1440 CSS pixels before merge.

Milestone 4 builds the financial data pipeline in five pull requests. The first downloads only official RHP/DRHP/Prospectus files, verifies content type, stores SHA-256 and document metadata, and never parses values. The second extracts native PDF tables with page-level evidence. The third adds OCR fallback for scanned pages. The fourth strengthens semantic validation for units, fiscal periods, scope, audit/restatement status, duplicate revisions, and changed documents. The fifth migrates the public API/UI from legacy `FinancialSnapshot` to human-approved `FinancialPublished` records. No confidence score may publish automatically.

Milestone 5 completes operating readiness: connect the custom domain, verify Resend DNS, separate Development and Production email behavior, add error monitoring, test authentication and reminders with a real consented user, and add backup/restore rehearsal. Only after these pass should wider beta begin.

Milestone 6 builds a provider-neutral IPO application demo. It stores no real PAN, demat, or UPI data. The adapter interface supports applicant validation, separate application creation, status, cancellation, and webhook handling. A live provider implementation begins only after a written Codifi or ODIN response and sandbox approval.

## Concrete Steps

For every change, start from an updated `main` in `/Users/aikanodi/ipobharosa` and create `codex/<small-scope>`. Run `npm ci` and `npm run check`. Push the branch, open a pull request, and wait for GitHub `validate`, `migration-smoke-test`, and Vercel Preview. Apply migrations only to Development, seed deterministic data, and run backend smoke checks against the Preview URL. Record the URL, commit SHA, commands, results, and screenshots in the pull request. Merge only after human approval. After Vercel promotes `main`, run read-only production smoke checks and watch errors/ingestion for at least one complete cycle.

The intended PR sequence is:

1. `release-foundation`: CI, missing migrations, safe admin configuration, Development isolation, and this living plan.
2. `ingestion-batching`: bounded work, checkpointing, retry and timeout tests.
3. `design-tokens-components`: coded tokens, shared primitives, accessibility and motion rules.
4. `board-ui-refresh`: responsive Board/Search/Compare/Calendar implementation.
5. `detail-ui-refresh`: IPO Detail, source evidence, loading/empty/error states.
6. `financial-document-ingestion`: official document download, validation and checksums.
7. `financial-native-extraction`: page-evidenced table extraction.
8. `financial-ocr-fallback`: scanned-page extraction and uncertainty routing.
9. `financial-review-hardening`: semantic rules, corrections, versioning and audit.
10. `financial-public-read`: switch public UI/API to approved records.
11. `domain-email-observability`: domain, Resend, auth/reminder E2E and monitoring.
12. `ipo-application-mock`: provider-neutral, dummy-data-only consent and tracking UI.
13. `ipo-provider-spike`: sandbox-only Codifi or ODIN adapter after approval.

## Validation and Acceptance

A pull request is mergeable only when `npm run lint`, `npm test`, `npm run db:validate`, and `npm run build` pass; committed migrations create a clean PostgreSQL database and leave no schema drift; the Vercel Preview reads and writes only Development data; backend success and failure paths are exercised; the relevant UI works on phone, tablet, and desktop; keyboard navigation and reduced motion are verified; no secrets or personal data appear in logs/screenshots; and the pull request contains evidence.

For Production, the promoted commit SHA must match the reviewed pull request. The home page and at least one IPO detail page must return successfully. Authentication and admin routes must reject unauthorized users. A failed ingestion cycle must be visible and retryable, and migrations must be forward-only and backed up before destructive schema changes.

## Idempotence and Recovery

Feature-branch deployments and Development seed operations must be safe to repeat. Database migrations are additive by default; column/table removals require a separate cleanup release after all readers have migrated. If a Preview fails, fix the same branch and redeploy. If a Production deployment fails before a migration, revert the code through a pull request. If it fails after an additive migration, deploy the previous compatible code and leave the additive schema in place until a forward fix is reviewed.

## Artifacts and Notes

Audit evidence collected on 2026-08-12:

    npm test: 12 files, 121 tests passed
    npm run build: passed
    npm run lint: failed before release-foundation fixes
    latest two scheduled ingestion runs: HTTP 504 FUNCTION_INVOCATION_TIMEOUT
    production aggregates: 41 IPOs, 461 GMP snapshots, 99 subscription snapshots,
      18 legacy financial rows, 0 new financial documents/extractions/published rows,
      1 user, 0 watchlist items

## Interfaces and Dependencies

The public financial read path will eventually consume only `FinancialPublished` records whose associated revision passed human review. The document ingester will accept an IPO identifier and official source URL and return immutable document metadata containing the actual file checksum, page count, fetch time, type, and source host. The extractor will return candidates carrying metric, raw text, normalized value, unit, fiscal period, scope, audit status, page number, table reference, parser method, and uncertainty flags. It will never publish.

The future IPO provider boundary will expose validation, placement, status, cancellation, and webhook verification without leaking Codifi- or ODIN-specific types into product UI. Until sandbox access is granted, only a mock implementation with dummy applicant data is permitted.

Revision note (2026-08-12): Created after a full repository/deployment/database audit to replace direct-to-production work with a verifiable PR and Preview workflow.

Revision note (2026-08-12 16:32 IST): Recorded the completed Production baseline, backup evidence, canonical alias correction, and release-foundation outcome after PR #1 merged.
