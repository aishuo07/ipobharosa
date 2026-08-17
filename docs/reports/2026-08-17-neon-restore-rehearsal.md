# Neon point-in-time recovery rehearsal — 17 August 2026

## Result

**PASS.** A temporary read-only branch was restored from the Production branch,
queried without writes, compared with the committed schema and then deleted.
The Production branch remained the ready primary/default branch throughout.

## Scope and safety controls

- Project: `purple-hall-03383323` (`neon-teal-ribbon`, AWS `us-east-1`, PostgreSQL 17)
- Production parent: `br-empty-dew-avr9pa4w` (`main`, primary and default)
- History retention observed before the drill: 21,600 seconds (6 hours)
- Temporary branch: `br-royal-math-avtpa6e6`
- Temporary endpoint type: `read_only`
- Automatic expiry was also set for 17 August 2026 at 12:30 UTC
- No migration, ingestion, reminder, approval or mutation command was run
- No database credential or connection string was printed or saved

## Timeline, RPO and RTO

| Evidence | UTC |
| --- | --- |
| Drill started | 10:53:30 |
| Temporary branch ready | 10:53:44 |
| Effective parent restore point reported by Neon | 10:24:16 |
| Validation and cleanup completed | 10:56:15 |

- Effective RPO: 29 minutes 14 seconds, within the 6-hour retention window.
- Branch-ready RTO: 14 seconds.
- End-to-end operational RTO (create, validate, compare and delete): 2 minutes 45 seconds.

The requested 10:35 UTC point resolved to Neon's effective parent timestamp of
10:24:16 UTC. The drill uses the provider-reported timestamp for the RPO claim.

## Read-only recovery evidence

The temporary connection reported `transaction_read_only = on`, and final Neon
branch metadata reported `written_data_bytes = 0`.

All seven applied migration names matched the seven committed Prisma migration
directories exactly:

```text
20260811134018_init
20260812152000_release_foundation
20260812194500_discovery_retry_backoff
20260812233000_official_ipo_evidence
20260813120000_ipo_filing_catalogue
20260814090000_ingestion_reliability
20260814194000_multi_source_official_evidence
```

Non-sensitive restored counts at the effective restore point:

| Table/data set | Restored count |
| --- | ---: |
| IPOs | 65 |
| Filing catalogue rows | 107 |
| GMP observations | 13,920 |
| Financial revisions | 103 |
| Published financial values | 2 |
| Users | 1 |
| Watchlist items | 0 |

Publication states were 43 published, 13 draft, 5 rejected and 4 quarantined.
Representative joined reads across `Ipo` and `Company` succeeded for Mainboard
and SME records in upcoming, open and closed lifecycle states.

## Production comparison

A separate explicit `BEGIN READ ONLY` transaction against Production returned
the same counts except for 108 filing catalogue rows. The one-row difference is
expected because Production continued syncing after the 10:24:16 restore point.
Production remained `main`, primary, default and ready after cleanup.

## Commands (credentials omitted)

```text
neonctl projects list --org-id <org> --output json
neonctl branches list --project-id <project> --org-id <org> --output json
neonctl branches create --project-id <project> --name <temporary> \
  --parent <timestamp> --compute --type read_only --expires-at <timestamp>
neonctl psql <temporary-branch> --project-id <project> \
  --database-name neondb --endpoint-type read_only -- \
  -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; ...; COMMIT;'
neonctl psql <production-branch> --project-id <project> \
  --database-name neondb -- -v ON_ERROR_STOP=1 \
  -c 'BEGIN READ ONLY; ...; COMMIT;'
neonctl branches delete <exact-temporary-branch-id> --project-id <project>
neonctl branches list --project-id <project> --org-id <org> --output json
```

## Cleanup evidence

Deletion targeted only `br-royal-math-avtpa6e6`. The final branch list contained
Production `main` and the pre-existing release-foundation baseline branch; the
recovery rehearsal branch was absent.

