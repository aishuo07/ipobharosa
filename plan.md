# Implementation Plan: Show every complete IPO with an explicit verification state

Status: approved by the product owner on 2026-08-14; implementation in progress.

## Approach

Stop treating visibility and verification as the same thing. Complete IPO records will be visible regardless of verification outcome, while the UI, SEO, calendar, comparison and source panels consistently communicate whether the facts passed automated official verification.

No database migration is required. `publicationState` remains the authoritative trust state and `REJECTED` records remain private.

## Changes required

### 1. Split public visibility from verified-only reads

**File:** `src/lib/board-data.ts`

- Add a typed `verification` object to `BoardIpo`: `VERIFIED | PENDING | NEEDS_REVIEW`, label, explanation, checked time and safe issue summary.
- Extract a pure mapper from `PublicationState` to the public trust contract.
- Add `getPublicIpos()` for `PUBLISHED`, `DRAFT`, and `QUARANTINED` rows that have every required core IPO field.
- Keep `getVerifiedIpos()` for `PUBLISHED` only.
- Make slug lookup use the public set so pending/review pages are accessible.
- Never expose `REJECTED` or incomplete records as term-complete IPO cards.

### 2. Make trust state unavoidable on the board

**Files:** `src/components/IpoBoard.tsx`, `src/app/globals.css`, `src/lib/board-filter.ts`

- Add a compact verification filter: All data, Verified, Pending, Needs review.
- Default to All data so current coverage is visible.
- Add a trust badge and one-line explanation on every card.
- Add a prominent explanation in the selected detail panel.
- Add verification state as the first trust row in Compare.
- Update empty states and counts so “pending” is not described as missing.
- Keep lifecycle status visually separate from data verification status.

### 3. Add a clear trust banner and accurate metadata on detail pages

**File:** `src/app/ipo/[slug]/page.tsx`

- Render a full-width trust banner below the hero.
- For pending records, state that values were collected but automated official verification is pending and may change.
- For conflicts, state that source values disagree and the record requires review.
- Preserve field-level source links and matched official fields.
- Add `robots: noindex, follow` for pending/conflicting pages; verified pages remain indexable.
- Avoid the phrase “verified” for sections that only contain unverified candidate facts.

### 4. Carry verification state into calendars and preserve safe indexing

**Files:** `src/app/page.tsx`, `src/app/sitemap.ts`, `src/app/api/calendar/route.ts`

- Homepage, calendar, and single-IPO calendar downloads use `getPublicIpos()`.
- Every calendar event includes a short trust suffix in the title—`[Verified]`, `[Verification pending]`, or `[Needs review]`—and a full warning plus source/detail link in the description.
- Calendar events retain the verification state even after leaving IPOBharosa, so Google Calendar/Apple Calendar users are not shown an uncertain date without context.
- Sitemap uses `getIndexableIpos()` and excludes pending/conflicting pages; those detail pages also return `noindex, follow` metadata.
- Google Calendar subscription and `.ics` exports include every complete IPO, with verified/pending/review labels.

### 5. Tests and release verification

**Files:** board-data/filter/calendar/metadata tests and smoke tooling as appropriate

- Unit-test publication-to-trust mapping and verify that rejected/incomplete IPOs stay private.
- Test verification filtering and mixed-state comparison labels.
- Test all three calendar trust labels and verify pending/conflicting descriptions warn that dates may change.
- Test that sitemap remains verified-only.
- Run lint, full tests, TypeScript/Production build and preview smoke.
- Verify on preview at 360/390/768/1024/1440 widths.
- Merge, deploy, and confirm Production shows all complete records with accurate verified/pending/review counts.

### 6. Make the official filing pipeline easier to understand

**Files:** `src/lib/discovery/filing-catalogue.ts`, `src/components/IpoBoard.tsx`, `src/app/globals.css`

- Enrich each filing card with `Filing only`, `Verification pending`, or `Available on board` status based on its linked IPO.
- Show DRHP/RHP and linked/awaiting summary counts above the grid.
- Add a direct IPOBharosa detail link when a filing is linked to a visible IPO.
- Retain SEBI source/document links, filing date, and concise explanation of what is still missing.
- Keep one newest/highest-stage entry per issuer to avoid duplicate noise.

## Safety constraints

- Visibility does not change `publicationState` and does not auto-approve anything.
- Pending/conflicting records cannot be described as application-ready or officially verified.
- Calendar may include every complete IPO only when every exported event carries its verification label and warning.
- Sitemap remains verified-only; pending/conflicting detail pages remain `noindex`.
- Missing core facts are represented in the SEBI filing pipeline, not fabricated as zero-valued IPO terms.
- `REJECTED` records never become public.

## Rollback

Revert the application PR. No schema or Production data rollback is necessary because the change is read/render-only.

## Todo

- [x] Add trust contract and pure state mapper.
- [x] Add public-complete and verified-only query paths.
- [x] Add verification filter, card badge and selected-detail warning.
- [x] Add compare verification row.
- [x] Add detail-page trust banner and noindex rules.
- [x] Add trust-labelled events for every complete IPO to ICS/Google Calendar.
- [x] Keep sitemap verified-only.
- [x] Add pipeline stage/coverage counts and linked IPO navigation.
- [x] Add unit/integration coverage.
- [x] Run full local verification.
- [ ] Create preview PR and perform responsive/trust-state checks.
- [ ] Merge and deploy.
- [ ] Verify exact Production counts and public rendering.

## Open questions

None. The requested behavior and pipeline enhancement map cleanly to existing database states without weakening verification.
