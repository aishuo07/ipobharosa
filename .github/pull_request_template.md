## Scope

- What changed:
- What is intentionally not included:

## Automated checks

- [ ] `npm run check`
- [ ] `npm run db:validate`
- [ ] Clean-database migration smoke test
- [ ] GitHub Actions are green

## Preview evidence

- Vercel Preview URL:
- Commit SHA tested:
- [ ] Preview uses the Development database, not Production
- [ ] `npm run smoke:preview -- <preview-url>` passed
- [ ] Backend success and failure paths tested
- [ ] Relevant UI checked at 360, 390, 768, 1024, and 1440 px
- [ ] Keyboard, focus, loading, empty, error, disabled, and reduced-motion states checked where relevant
- Screenshots/video/logs:

## Data and release safety

- [ ] No secrets, real PAN/demat/UPI data, or other personal data added to code, fixtures, logs, or screenshots
- [ ] Migration is additive or has a documented forward-recovery plan
- [ ] Production migration/data action is explicitly listed, if any
- [ ] Rollback or forward-fix path is documented

## Reviewer decision

- [ ] Scope is small enough to verify
- [ ] Evidence proves the behavior, not only the UI appearance
- [ ] Ready to merge to `main` and deploy to Production
