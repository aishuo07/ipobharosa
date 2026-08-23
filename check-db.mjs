import pg from 'pg';
import os from 'os';

const connStr = `postgresql://aish:H9XWGh7G_8rBrowv6F0Byw@small-chirper-32604.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full&sslrootcert=${os.homedir()}/.postgresql/root.crt`;
const client = new pg.Client({ connectionString: connStr });
await client.connect();

console.log('=== Ingestion Runs (last 10) ===');
const { rows: runs } = await client.query(`SELECT id::text, "startedAt"::text, "finishedAt"::text, ok, "skippedDueToLock", error FROM "IngestionRun" ORDER BY "startedAt" DESC LIMIT 10`);
runs.forEach(r => console.log(' ', r.startedAt?.split('.')[0], '|', r.ok ? 'OK' : 'FAIL', '| skip:', r.skippedDueToLock, '| err:', r.error || 'none'));

console.log('\n=== IPOs ===');
const { rows: ipos } = await client.query(`SELECT c.name, i.status, i."openDate"::text, i."listingDate"::text, i."publicationState" FROM "Ipo" i JOIN "Company" c ON c.id = i."companyId" ORDER BY i."openDate" DESC`);
ipos.forEach(i => console.log(' ', i.name, '|', i.status, '|', i.publicationState, '| open:', i.openDate?.split('T')[0] || 'N/A'));

console.log('\n=== SourceOperationHealth ===');
const { rows: soh } = await client.query(`SELECT source, operation, "lastAttemptAt"::text, "lastSuccessAt"::text, "lastError", "consecutiveFailures" FROM "SourceOperationHealth" ORDER BY "lastAttemptAt" DESC LIMIT 15`);
if (soh.length === 0) console.log('  (empty)');
soh.forEach(s => console.log(' ', s.source, '|', s.operation, '| fail:', s.consecutiveFailures, '| err:', s.lastError || 'none'));

console.log('\n=== GMP Sources ===');
const { rows: gs } = await client.query(`SELECT source, active FROM "GmpSource"`);
gs.forEach(g => console.log(' ', g.source, '| active:', g.active));

console.log('\n=== Discovery Attempts ===');
const { rows: da } = await client.query(`SELECT "companyName", attempts, "lastAttemptAt"::text FROM "DiscoveryAttempt" ORDER BY "lastAttemptAt" DESC LIMIT 10`);
da.forEach(d => console.log(' ', d.companyName, '| attempts:', d.attempts, '| last:', d.lastAttemptAt?.split('.')[0] || 'never'));

await client.end();
