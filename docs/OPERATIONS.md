# IPOBharosa Production operations

## Service ownership boundary

The public service has four independent signals:

1. Vercel serves the board, IPO detail, login and PWA routes.
2. PostgreSQL/Neon answers the minimal `/api/health` freshness query.
3. The hourly ingestion workflow records a successful completed run.
4. The 15-minute Production monitor checks all three paths from GitHub Actions.

The health endpoint contains no secrets, user data, IPO counts or internal error text. It returns `503` when the database is unreachable, no successful ingestion exists, or the latest successful ingestion is older than 150 minutes.

## Alert lifecycle

- A failed external probe opens one GitHub issue named `[monitor] IPOBharosa Production health degraded`.
- Repeated failures do not create additional issues or comments.
- The first healthy probe comments with the recovery run and closes the issue.
- The workflow remains red while degraded so repository notifications and the Actions page remain useful.

## First response

1. Open the linked workflow run and identify which public check failed.
2. Do not rerun ingestion while another invocation owns the ingestion lock.
3. If the board/detail/login are down together, inspect Vercel deployment status first.
4. If only `/api/health` fails, inspect Neon reachability and the latest `IngestionRun` without changing public IPO data.
5. If ingestion is stale, inspect the hourly workflow, source-health dashboard and persisted checkpoint. Use the existing manual workflow dispatch only after confirming no run is active.
6. Do not publish guessed values to make the health check green.

## Corrections and source incidents

- Temporary source failure remains a retry state.
- Official-source conflict remains visible in the admin exception queue and must not auto-overwrite published data.
- A correction records old value, new value, source, actor and reason.
- Requests concerning attribution or removal should be recorded as an issue before changing source adapters or evidence history.

## Isolated restore rehearsal

This is a launch gate and must be performed with Neon access. Never restore over Production.

1. Record the Production branch ID, latest backup/restore point and current time.
2. Create a new isolated restore branch/database from that point.
3. Set a one-off local or Preview `DATABASE_URL` to the isolated target only.
4. Run `npx prisma migrate status` and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.
5. Compare non-sensitive row counts for core IPO, evidence, ingestion and user-owned tables with the source snapshot.
6. Run the Preview smoke test against a deployment attached to the restored database. Do not send reminders or run ingestion.
7. Record start/end time, chosen restore point, observed data-loss window, result and reviewer in the launch issue.
8. Delete the isolated target after evidence is accepted.

The target launch evidence is an observed recovery time and recovery-point window, not an untested claim based on the provider dashboard.
