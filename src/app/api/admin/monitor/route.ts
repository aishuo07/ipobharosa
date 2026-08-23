import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeStoredCheckpointAlertReasons } from "@/lib/ingestion/alert";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d: Date | string | null): string {
  if (!d) return "never";
  const date = typeof d === "string" ? new Date(d) : d;
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function statusBadge(ok: boolean, skipped: boolean): string {
  if (skipped) return '<span style="color:#f59e0b">⏭ SKIPPED</span>';
  if (ok) return '<span style="color:#22c55e">✅ OK</span>';
  return '<span style="color:#ef4444">❌ FAILED</span>';
}

function healthBadge(healthy: boolean): string {
  return healthy
    ? '<span style="color:#22c55e;font-size:24px;font-weight:bold">HEALTHY</span>'
    : '<span style="color:#ef4444;font-size:24px;font-weight:bold">UNHEALTHY</span>';
}

export async function GET() {
  try {
    const now = new Date();

    const [latestRun, recentRuns, sourceHealth, ipoStats] = await Promise.all([
      prisma.ingestionRun.findFirst({
        where: { ok: true, skippedDueToLock: false, finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { id: true, finishedAt: true, summary: true, startedAt: true },
      }),
      prisma.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { id: true, ok: true, error: true, startedAt: true, finishedAt: true, skippedDueToLock: true, summary: true },
      }),
      prisma.sourceOperationHealth.findMany({
        orderBy: { consecutiveFailures: "desc" },
        select: { key: true, source: true, operation: true, consecutiveFailures: true, lastSuccessAt: true, lastError: true },
      }),
      prisma.ipo.groupBy({
        by: ["status", "publicationState"],
        _count: true,
      }),
    ]);

    const latestSummary = latestRun?.summary as Record<string, unknown> | null;
    const alertReasons = latestSummary ? computeStoredCheckpointAlertReasons(latestSummary) : null;
    const sourceIssueCount = alertReasons?.filter((r) => !r.includes("drift")).length ?? 0;
    const lastRunAge = latestRun?.finishedAt
      ? Math.round((now.getTime() - new Date(latestRun.finishedAt).getTime()) / 60000)
      : null;
    const healthy = sourceIssueCount === 0 && lastRunAge !== null && lastRunAge < 120;

    const totalIpos = ipoStats.reduce((sum, r) => sum + r._count, 0);
    const publishedIpos = ipoStats.filter(r => r.publicationState === "PUBLISHED").reduce((sum, r) => sum + r._count, 0);
    const quarantinedIpos = ipoStats.filter(r => r.publicationState === "QUARANTINED").reduce((sum, r) => sum + r._count, 0);
    const upcomingIpos = ipoStats.filter(r => r.status === "UPCOMING").reduce((sum, r) => sum + r._count, 0);
    const openIpos = ipoStats.filter(r => r.status === "OPEN").reduce((sum, r) => sum + r._count, 0);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPOBharosa — Pipeline Status</title>
  <meta http-equiv="refresh" content="300">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    .subtitle { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #334155; }
    .card h2 { font-size: 16px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { text-align: center; padding: 12px; background: #0f172a; border-radius: 8px; }
    .stat .number { font-size: 32px; font-weight: bold; color: #38bdf8; }
    .stat .label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; color: #94a3b8; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #334155; }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; font-size: 14px; }
    tr:hover { background: #1e293b; }
    .ok { color: #22c55e; }
    .fail { color: #ef4444; }
    .warn { color: #f59e0b; }
    .alert-box { background: #451a03; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .alert-box.empty { background: #052e16; border-color: #22c55e; }
    .footer { text-align: center; color: #475569; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 IPOBharosa Pipeline Status</h1>
    <p class="subtitle">Last checked: ${fmtDate(now.toISOString())} IST • Auto-refreshes every 5 min</p>

    ${!healthy ? `<div class="alert-box">⚠️ <strong>Issues detected:</strong> ${(alertReasons ?? []).join(" • ")}</div>` : `<div class="alert-box empty">✅ <strong>All clear</strong> — pipeline is healthy, no issues detected</div>`}

    <div class="card">
      <h2>Pipeline Health</h2>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        ${healthBadge(healthy)}
        <div>
          <div>Last successful run: <strong>${timeAgo(latestRun?.finishedAt ?? null)}</strong></div>
          <div>Source issues: <strong class="${sourceIssueCount > 0 ? 'fail' : 'ok'}">${sourceIssueCount}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>IPO Overview</h2>
      <div class="stat-grid">
        <div class="stat"><div class="number">${totalIpos}</div><div class="label">Total IPOs</div></div>
        <div class="stat"><div class="number" style="color:#22c55e">${publishedIpos}</div><div class="label">Published</div></div>
        <div class="stat"><div class="number" style="color:#f59e0b">${quarantinedIpos}</div><div class="label">Quarantined</div></div>
        <div class="stat"><div class="number" style="color:#38bdf8">${upcomingIpos}</div><div class="label">Upcoming</div></div>
        <div class="stat"><div class="number" style="color:#a78bfa">${openIpos}</div><div class="label">Open Now</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Recent Pipeline Runs (Last 10)</h2>
      <table>
        <tr><th>Run</th><th>Status</th><th>Started</th><th>Duration</th><th>Error</th></tr>
        ${recentRuns.map(r => {
          const dur = r.finishedAt && r.startedAt
            ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)
            : null;
          return `<tr>
            <td><code>${r.id}</code></td>
            <td>${statusBadge(r.ok, r.skippedDueToLock)}</td>
            <td>${fmtDate(r.startedAt?.toISOString() ?? null)}</td>
            <td>${dur !== null ? dur + 's' : '—'}</td>
            <td class="fail">${r.error ? r.error.substring(0, 60) : '—'}</td>
          </tr>`;
        }).join("\n        ")}
      </table>
    </div>

    <div class="card">
      <h2>Data Sources</h2>
      <table>
        <tr><th>Source</th><th>Operation</th><th>Status</th><th>Last Success</th></tr>
        ${sourceHealth.map(s => `<tr>
          <td><strong>${s.source}</strong></td>
          <td>${s.operation}</td>
          <td class="${s.consecutiveFailures > 0 ? 'fail' : 'ok'}">${s.consecutiveFailures > 0 ? '❌ ' + s.consecutiveFailures + ' failures' : '✅ OK'}</td>
          <td>${timeAgo(s.lastSuccessAt?.toISOString() ?? null)}</td>
        </tr>`).join("\n        ")}
      </table>
    </div>

    <div class="footer">
      IPOBharosa Pipeline Monitor • Cron-job.org schedules • Sentry tracks errors • Email alerts on issues
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    return new NextResponse(`<html><body style="background:#0f172a;color:#ef4444;padding:40px;font-family:sans-serif">
      <h1>Monitor Error</h1><pre>${error instanceof Error ? error.message : String(error)}</pre>
    </body></html>`, { status: 500, headers: { "Content-Type": "text/html" } });
  }
}
