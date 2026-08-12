# Implementation Plan: targeted filing financial extraction

## Approach

Replace fixed-page guessing with a fail-closed, TOC/heading-driven worker. Keep discovery and financial extraction independent. Preserve the existing approval boundary.

## Tasks

- [DONE] Add a pure Python section locator and unit/period helpers with unit tests.
- [DONE] Update `extract.py` to scan located summary/restated-financial pages only.
- [DONE] Reject candidates with unknown fiscal year, unit, scope, or audit status.
- [DONE] Add a production batch worker that queries eligible captured documents and submits only complete candidates.
- [DONE] Add a manual/scheduled GitHub Actions workflow with pinned dependencies and no auto-publish capability.
- [ ] Add exact draft/retry reason reporting for operations.
- [ ] Run Python tests, application tests, lint/build, and real filing samples.
- [ ] Open an isolated PR, verify Preview and CI, then merge only if clean.

## Rollback

The worker is a separate workflow. Disable its schedule or remove its submission secrets; public rendering and regular ingestion remain unaffected.

## Approval

Approved by the user's explicit “krooo jldiii” instruction on 2026-08-12.
