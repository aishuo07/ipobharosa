# Research: official IPO coverage and targeted financial extraction

## Current data flow

- `src/lib/discovery/ipowatch-list.ts` discovers 65 current/recent Mainboard and SME candidates.
- `src/lib/discovery/discover.ts` processes ten candidates per cycle and requires valid core facts, a Sahi existence check, and an exchange/SEBI-hosted filing before auto-publish.
- `src/lib/financials/pdf-extraction.ts` is intentionally disabled in Next.js.
- `pdf-extractor/extract.py` is an offline worker, but scans only pages 8–32 and guesses table columns.
- `src/app/api/admin/submit-extracted-financials/route.ts` accepts complete evidence and always routes it to `REVIEW_REQUIRED`.
- `src/lib/financials/workflow.ts` is the only path to immutable `FinancialPublished`; it requires explicit approval.

## Production evidence

- 65 relevant listing candidates; 46 tracked, 14 published and 32 drafts.
- 16 untracked candidates have retry records due to detail-page fetch failures; three are deferred.
- 27 drafts have no filing link. Five have a filing link but lack second-source confirmation.
- Five filing PDFs have been captured with SHA-256 hashes; no financial candidate has entered review and no financial value is published.

## Real filing test

Lohia Corp RHP is 533 pages. Its table of contents points to:

- Summary of Financial Information: printed page 70
- Restated Financial Information: printed page 277

The old page-8–32 parser returned one incomplete value. Text extraction around the restated section exposes explicit columns for 31 March 2026, 31 March 2025, and 31 March 2024 plus revenue and profit rows. The correct strategy is section-location first, not a fixed early-page window.

## Constraints

- Third-party financial tables may be comparison signals but cannot earn a verified label.
- Unknown year, unit, scope, or audit status must never be guessed or submitted.
- Extraction never auto-publishes; every candidate remains `REVIEW_REQUIRED`.
- Slow PDF work must run outside the Vercel request and normal two-hour discovery cycle.

## Chosen architecture

```text
Captured filing URL
  -> scheduled/manual GitHub Actions Python worker
  -> locate financial section from TOC/headings
  -> scan only the relevant page window
  -> extract candidates with explicit period/unit/scope/page
  -> reject incomplete/ambiguous candidates
  -> authenticated submission API
  -> REVIEW_REQUIRED admin queue
  -> human approval
  -> immutable FinancialPublished
  -> public page with clickable evidence
```

