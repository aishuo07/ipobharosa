import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { approveIpo, rejectIpo } from "./actions";

export const revalidate = 0;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const [stateCounts, sources, recentRuns, reviewQueue] = await Promise.all([
    prisma.ipo.groupBy({ by: ["publicationState"], _count: true }),
    prisma.gmpSource.findMany({ include: { health: true }, orderBy: { name: "asc" } }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.ipo.findMany({
      where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
      include: { company: true },
      orderBy: { discoveredAt: "desc" },
    }),
  ]);

  const countOf = (state: string) => stateCounts.find((s) => s.publicationState === state)?._count ?? 0;
  const published = countOf("PUBLISHED");
  const draft = countOf("DRAFT");
  const quarantined = countOf("QUARANTINED");
  const rejected = countOf("REJECTED");

  return (
    <div className="wrap">
      <div className="legal-head">
        <Link href="/" className="legal-back">← IPOBharosa</Link>
      </div>
      <div className="legal-wrap" style={{ maxWidth: 980 }}>
        <h1>Pipeline</h1>
        <div className="legal-updated">Signed in as {session!.user!.email}</div>

        <h2>Discovery funnel</h2>
        <div className="pipeline-flow">
          <div className="pipeline-stage">
            <div className="pipeline-count">{published}</div>
            <div className="pipeline-label">Published</div>
          </div>
          <div className="pipeline-arrow">←</div>
          <div className="pipeline-stage">
            <div className="pipeline-count">{draft}</div>
            <div className="pipeline-label">Draft<br />(needs review)</div>
          </div>
          <div className="pipeline-arrow">←</div>
          <div className="pipeline-stage pipeline-stage-warn">
            <div className="pipeline-count">{quarantined}</div>
            <div className="pipeline-label">Quarantined<br />(inconsistent data)</div>
          </div>
          <div className="pipeline-arrow">←</div>
          <div className="pipeline-stage pipeline-stage-muted">
            <div className="pipeline-count">{rejected}</div>
            <div className="pipeline-label">Rejected</div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: -6 }}>
          Every 2h: IPO Watch listing → new-candidate check → fetch facts → validate → cross-check Sahi →
          confidence decision → {"{"}HIGH: auto-publish, MEDIUM: draft, inconsistent: quarantine{"}"}.
        </p>

        <h2>GMP source health</h2>
        <div className="table-wrap">
          <table className="dates">
            <thead>
              <tr>
                <th>Source</th>
                <th>Last success</th>
                <th>Consecutive failures</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{fmtDate(s.health?.lastSuccessAt)}</td>
                  <td>{s.health?.consecutiveFailures ?? 0}</td>
                  <td>
                    {s.health?.degraded ? (
                      <span style={{ color: "var(--critical)" }}>Degraded</span>
                    ) : (
                      <span style={{ color: "var(--good)" }}>Healthy</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Recent ingestion runs</h2>
        <div className="table-wrap">
          <table className="dates">
            <thead>
              <tr>
                <th>Started</th>
                <th>Duration</th>
                <th>Result</th>
                <th>Discovery</th>
                <th>GMP</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => {
                const s = r.summary as Record<string, unknown> | null;
                const disc = s?.discovery as Record<string, unknown> | undefined;
                const gmp = s?.gmp as Record<string, unknown> | undefined;
                const durationMs = r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null;
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.startedAt)}</td>
                    <td>{durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td>
                      {r.skippedDueToLock ? (
                        <span style={{ color: "var(--ink-faint)" }}>skipped (locked)</span>
                      ) : r.ok ? (
                        <span style={{ color: "var(--good)" }}>ok</span>
                      ) : (
                        <span style={{ color: "var(--critical)" }} title={r.error ?? ""}>failed</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {disc
                        ? `+${disc.autoPublished ?? 0} auto, +${disc.draftsCreated ?? 0} draft, ${disc.quarantined ?? 0} quarantined`
                        : "—"}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {gmp ? `${gmp.snapshotsWritten ?? 0} written, ${gmp.ipoWithNoData ?? 0} no data` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2>Review queue ({reviewQueue.length})</h2>
        {reviewQueue.length === 0 && <p style={{ color: "var(--ink-muted)" }}>Nothing pending review.</p>}
        {reviewQueue.map((ipo) => (
          <div key={ipo.id} className="review-card">
            <div className="review-head">
              <span className={"badge " + (ipo.publicationState === "QUARANTINED" ? "badge-closing-soon" : "badge-upcoming")}>
                {ipo.publicationState}
              </span>
              <strong>{ipo.company.name}</strong>
              <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>({ipo.board})</span>
            </div>
            {ipo.quarantineReason && (
              <p style={{ color: "var(--critical)", fontSize: 13 }}>Reason: {ipo.quarantineReason}</p>
            )}
            <div className="review-facts">
              <span>Price band ₹{ipo.priceBandLow?.toString()}–₹{ipo.priceBandHigh?.toString()}</span>
              <span>Lot {ipo.lotSize}</span>
              <span>Issue ₹{ipo.issueSizeCr?.toString()} Cr</span>
              <span>Opens {fmtDate(ipo.openDate)}</span>
              <span>Lists {fmtDate(ipo.listingDate)}</span>
              <span>Registrar: {ipo.registrar ?? "—"}</span>
            </div>
            <div className="review-facts">
              <span>Sources: {ipo.discoveredFrom.join(", ") || "—"}</span>
              {ipo.drhpUrl && <a href={ipo.drhpUrl} target="_blank" rel="noopener noreferrer">DRHP ↗</a>}
              {ipo.rhpUrl && <a href={ipo.rhpUrl} target="_blank" rel="noopener noreferrer">RHP ↗</a>}
              {ipo.sourceUrl && <a href={ipo.sourceUrl} target="_blank" rel="noopener noreferrer">Source page ↗</a>}
            </div>
            <div className="review-actions">
              <form action={approveIpo} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="id" value={ipo.id} />
                <input name="sector" placeholder="Sector (required)" required className="btn" style={{ fontWeight: 400 }} />
                <button type="submit" className="btn btn-primary">Approve & publish</button>
              </form>
              <form action={rejectIpo} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="id" value={ipo.id} />
                <input name="reason" placeholder="Rejection reason (required)" required className="btn" style={{ fontWeight: 400 }} />
                <button type="submit" className="btn btn-ghost">Reject</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
