# Implementation log: Production operations reliability

## 2026-08-15

- Product owner explicitly approved the written plan and requested immediate implementation and merge.
- Started implementation from `origin/main` on `codex/production-ops-reliability`.
- Safety constraints: no timestamp-ordering hacks, no schema mutation, admin auth and ingestion lock required, no browser-supplied official values.
- Extracted one shared revalidation implementation and added an exact-ID entry point restricted to unpublished retryable states.
- Added 24-hour cooldowns for real conflicts and invalid candidates while preserving the existing exponential unavailable-source retry schedule.
- Added a locked, audited retry operation and authenticated admin action; busy runs are safe no-ops and locks release on every path.
- Enhanced the admin operations view with retry controls, source-attempt evidence, exact provider reasons, due/waiting/conflict/degraded counts and excluded issue types.
- Local verification passed: 36 test files / 235 tests, ESLint with zero warnings, TypeScript, Prisma schema validation and optimized Next.js Production build.
- Preview deployment `dpl_7gZXnaAUqL6XUYAUzqmNqEHcGQD6` reached READY. Authenticated smoke checks returned 200 for board, representative IPO detail and calendar; unauthenticated `/admin` returned the expected 307 login redirect.
