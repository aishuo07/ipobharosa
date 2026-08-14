# Implementation Plan: multi-source official verification and richer IPO evidence

Status: approved by product owner; implementation in progress.

## Approach

Add BSE as a first-class official exchange source beside NSE, keep SEBI as authoritative filing/document evidence, and replace the single generic “pending” explanation with a field-level verification report. Enrich the public IPO page from structured official exchange fields without weakening the existing rule for financial statements.

The first release targets the largest verified uplift with bounded risk: BSE current/historical catalogue + issue detail, conservative entity aliases, issue-type classification, multi-provider evidence, and clear public provenance. It does not auto-extract financial statements from PDFs.

## Changes required

### 1. Introduce a provider registry and multi-source result

**Files:** `src/lib/discovery/official/index.ts`, `src/lib/discovery/official/types.ts`, new `src/lib/discovery/official/registry.ts`

- Replace the hard-coded NSE singleton with a registry of official providers.
- Fetch catalogues once per ingestion run, bound detail concurrency, and return provider-specific `FOUND | NOT_FOUND | UNAVAILABLE | WRONG_ISSUE_TYPE` results.
- Keep each provider's evidence independent so NSE/BSE disagreement is observable.
- Extend source types to `NSE | BSE | SEBI` and preserve a direct source URL per field.

Key shape:

```ts
type OfficialEvidenceBundle = {
  evidence: OfficialIpoEvidence[];
  attempts: Array<{
    source: OfficialSourceName;
    status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE" | "WRONG_ISSUE_TYPE";
    reason: string | null;
  }>;
};
```

### 2. Add a bounded BSE official adapter

**Files:** new `src/lib/discovery/official/bse-client.ts`, new `src/lib/discovery/official/bse.ts`

- Read BSE current and historical public-issue catalogues used by BSE's own web application.
- Deduplicate by `IPO_NO`, then match issuer names conservatively.
- Reject/category-route anything whose official type is not `IPO`; specifically report FPO and InvIT rather than leaving them in a generic retry loop.
- Fetch issue detail and normalize the ten existing material fields.
- Capture non-material enrichments: symbol, issue type, issue-size shares, face value, market lot, minimum bid, maximum bid quantities, sponsor banks, UPI cut-off, price-band ad, official prospectus, corrigendum, anchor allocation and exchange notices.
- Implement a fixed-host GET-only HTTPS client because BSE's response headers are malformed for normal Undici parsing. Enforce host, path allowlist, timeout, response-size ceiling, no redirects, identity encoding and JSON validation.

### 3. Expand NSE normalization to retain structured enrichment

**File:** `src/lib/discovery/official/nse.ts`

- Keep the existing publication-gate values unchanged.
- Normalize already-present NSE fields for face value, issue type, symbol, minimum order, retail/employee limits, employee discount, market timings, sponsor banks, UPI cut-off and official document links.
- Keep live bid/subscription data as a timestamped demand snapshot rather than mixing it with static facts.
- Preserve the raw payload for audit and direct official field URLs.

### 4. Make consensus provider-aware and safe

**Files:** `src/lib/discovery/official/consensus.ts`, `src/lib/discovery/official/normalization.ts`

- Compare candidate-to-provider and provider-to-provider field values.
- Auto-publish when at least one complete official exchange record matches and no second found provider contradicts it.
- Route any NSE/BSE disagreement or real candidate conflict to one deduplicated incident.
- Add conservative whitespace normalization and an explicit registrar alias table for verified legal renames. No fuzzy matching.
- Permit BSE official prospectus URLs in the RHP/Prospectus evidence guard.
- Return a verification coverage summary: matched/missing/conflicting material fields and providers checked.

### 5. Persist normalized evidence and source-attempt reasons

**Files:** `prisma/schema.prisma`, additive migration, `src/lib/discovery/official/persistence.ts`

- Add normalized evidence/enrichment JSON to `OfficialEvidenceCapture`; raw payload remains append-only.
- Persist source attempts even when a provider returns not-found/unavailable so the UI/admin dashboard can explain coverage accurately.
- Store issue type separately from IPO lifecycle status to prevent FPO/InvIT contamination.
- Keep migrations additive and retain code-first/schema-later compatibility fallbacks on public reads.

### 6. Route existing Production records safely

**Files:** `src/lib/discovery/discover.ts`, `src/lib/discovery/revalidate.ts`, one read-only audit script under `scripts/`

- Record source health per provider instead of labelling every check NSE.
- Use the multi-source bundle during discovery and retry revalidation.
- Run a no-write report for all 33 current non-verified records before enabling writes.
- Expected initial routing from current data:
  - 10 exact BSE matches immediately eligible;
  - up to 2 more eligible after deterministic registrar alias normalization;
  - Dhaval Packaging stays needs-review for material price/lot conflict;
  - 4 FPOs and 1 InvIT removed from the IPO verification queue and reported separately;
  - remaining no-exchange matches stay provisional with explicit coverage reason.
- Do not bulk-correct conflicts or category changes without the dry-run output being attached to the PR.

### 7. Make verification understandable to users

**Files:** `src/lib/public-verification.ts`, `src/lib/board-data.ts`, `src/app/ipo/[slug]/page.tsx`, `src/components/IpoBoard.tsx`, `src/app/globals.css`

- Show a compact score such as `10/10 core facts matched` and provider chips (`NSE`, `BSE`, `SEBI filing`).
- Show each material field with status, official value, direct source link and checked time.
- Replace generic pending text with specific safe reasons:
  - `Not listed in NSE; BSE check scheduled`
  - `Official filing found; final exchange terms not published yet`
  - `Price band and lot size differ across sources`
- Expose real `officialLastAttemptAt` and `officialNextAttemptAt` through the public select with migration compatibility fallback.
- Add a structured “Application facts” section for the richer official fields and “Official documents” links.
- Keep all pending/review pages `noindex`; only fully verified IPOs remain sitemap/indexable.

### 8. Improve subscription clarity from official demand data

**Files:** new official-demand normalizer plus existing subscription ingestion/display modules

- Prefer timestamped NSE/BSE official category-level demand when present.
- Keep Sahi as secondary corroboration/fallback and label it accordingly.
- Never mix demand/subscription with GMP; show exchange timestamp and source link.
- Open a conflict incident if official exchange totals disagree beyond deterministic rounding rules.

### 9. Preserve strict financial verification

**Files:** no publication-policy change in `src/lib/financials/workflow.ts`; UI copy only if needed

- Continue publishing financials only from immutable official documents with fiscal year, scope, unit and page citation.
- Do not claim exchange issue metadata verifies revenue/PAT/EPS.
- Show the official RHP/Prospectus link when financials are unavailable and say exactly what is pending.

## Testing strategy

- BSE client: host/path rejection, GET-only behavior, timeout, size limit, invalid JSON, malformed-header compatibility, current/historical caching.
- BSE parser: mainboard, SME, fixed price, missing optional fields, minimum bid vs market lot, official links.
- Issue-type guard: IPO accepted; FPO/InvIT/rights/buyback rejected or separately classified.
- Provider consensus: NSE only, BSE only, both agree, both conflict, one unavailable, both unavailable.
- Normalization: KFin spacing, Bigshare spacing, MUFG/Link Intime legal alias, unrelated near-match rejection.
- Persistence: append-only captures, source attempts, field sources, normalized enrichment, incident deduplication.
- Public contract: score, specific pending reasons, last/next check, source links, noindex rules.
- Production dry-run fixture: exact expected counts and named conflict/category lists.
- Full suite: Prisma validate/migration smoke, lint, unit/integration tests, Production build, preview smoke and responsive checks at 360/390/768/1024/1440.

## Release sequence

1. Create a fresh `codex/` branch from latest `origin/main`.
2. Implement migration + adapters + tests behind `BSE_OFFICIAL_SOURCE_ENABLED=false`.
3. Deploy preview, run fixtures and no-write Production audit.
4. Review exact eligible/conflict/wrong-type lists in PR evidence.
5. Merge additive migration and code.
6. Apply Production migration.
7. Enable BSE source with auto-publish still disabled; run one no-write/held cycle.
8. Verify captures, source health and public labels.
9. Enable existing official auto-publish gate and process a bounded batch.
10. Confirm new verified/pending/review/type counts and watch alerts for one full ingestion cycle.

## Rollback

- Disable `BSE_OFFICIAL_SOURCE_ENABLED`; registry returns to NSE-only without a code rollback.
- New columns/tables are additive and can remain unused.
- Revert UI/adapter commit if required. Append-only evidence remains audit history.
- No rollback ever deletes evidence or silently reverts a human correction.

## Todo

- [DONE] Create fresh branch from latest main.
- [DONE] Add BSE bounded transport and fixtures.
- [DONE] Add BSE catalogue/detail adapter.
- [DONE] Expand NSE enrichment normalization.
- [DONE] Implement source registry and provider-aware consensus.
- [DONE] Add conservative legal-alias normalization.
- [DONE] Add additive evidence/source-attempt migration.
- [DONE] Update discovery/revalidation/source health.
- [DONE] Add issue-type routing and audit report.
- [DONE] Add field-level verification and richer official facts UI.
- [DONE] Add official demand normalization.
- [DONE] Add unit/integration tests and run all local quality gates.
- [ ] Confirm the clean-database migration smoke in CI (local Docker daemon was unavailable).
- [DONE] Run no-write Production audit and attach exact evidence.
- [DONE] Deploy the branch preview and verify board/detail responsiveness at 360/390/768/1024/1440 without horizontal overflow.
- [ ] Create the PR (GitHub CLI/browser authentication required).
- [ ] Merge, migrate, feature-flag enable and monitor one full cycle.

## Open questions

None required for implementation. The safety defaults are: one complete official exchange source can verify an IPO; any official-source conflict fails closed; SEBI filing-only evidence does not verify final terms; non-IPO issue types do not count as IPOs.
