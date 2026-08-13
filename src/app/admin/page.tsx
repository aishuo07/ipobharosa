import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { loginPathFor } from "@/lib/auth-redirect";
import { REJECTION_REASONS } from "@/lib/admin-review";
import { filingEvidenceClass, filingEvidenceLabel, filingSourceHost } from "@/lib/document-evidence";
import { approveIpo, rejectIpo } from "./actions";

export const revalidate = 0;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function reviewReasons(ipo: {
  publicationState: string;
  quarantineReason: string | null;
  discoveredFrom: string[];
  drhpUrl: string | null;
  rhpUrl: string | null;
}): string[] {
  if (ipo.quarantineReason) return [ipo.quarantineReason];
  const reasons: string[] = [];
  if (ipo.publicationState === "DRAFT") reasons.push("Official source is incomplete or temporarily unavailable; the pipeline will retry automatically");
  if (ipo.publicationState === "QUARANTINED") reasons.push("Official and discovery facts conflict; only these fields need a human decision");
  const filingUrls = [ipo.drhpUrl, ipo.rhpUrl].filter((url): url is string => Boolean(url));
  if (!filingUrls.some((url) => filingEvidenceClass(url) === "OFFICIAL")) {
    reasons.push(filingUrls.length ? "Filing copy is not hosted by an exchange or SEBI" : "Official filing is missing");
  }
  return reasons.length ? reasons : ["Manual sign-off required by the discovery policy"];
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect(loginPathFor("/admin"));
  if (!isAdminEmail(session?.user?.email)) notFound();

  const [stateCounts, sources, recentRuns, reviewQueue] = await Promise.all([
    prisma.ipo.groupBy({ by: ["publicationState"], _count: true }),
    prisma.gmpSource.findMany({ include: { health: true }, orderBy: { name: "asc" } }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.ipo.findMany({
      where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
      include: {
        company: true,
        officialEvidence: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          include: { comparisons: { where: { status: "CONFLICT" }, orderBy: { field: "asc" } } },
        },
      },
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
      <div className="admin-shell">
      <div className="admin-topbar">
        <Link href="/" className="legal-back">← IPOBharosa</Link>
        <nav className="admin-nav" aria-label="Admin sections">
          <Link href="/admin" aria-current="page">IPO review</Link>
          <Link href="/admin/financials">Financial review</Link>
        </nav>
      </div>
      <main className="admin-main">
        <div className="admin-title-row">
          <div>
            <p className="section-label">Publishing control</p>
            <h1>IPO review queue</h1>
            <p>Only genuine source conflicts need a decision. Temporary gaps retry automatically.</p>
          </div>
          <div className="admin-identity">{session!.user!.email}</div>
        </div>

        <section className="pipeline-flow" aria-label="Publishing status">
          <div className="pipeline-stage pipeline-stage-good">
            <div className="pipeline-count">{published}</div>
            <div className="pipeline-label">Published</div>
          </div>
          <div className="pipeline-stage">
            <div className="pipeline-count">{draft}</div>
            <div className="pipeline-label">Waiting / retrying</div>
          </div>
          <div className="pipeline-stage pipeline-stage-warn">
            <div className="pipeline-count">{quarantined}</div>
            <div className="pipeline-label">Data conflicts</div>
          </div>
          <div className="pipeline-stage pipeline-stage-muted">
            <div className="pipeline-count">{rejected}</div>
            <div className="pipeline-label">Rejected</div>
          </div>
        </section>

        <div className="review-section-head">
          <div><h2>Exceptions and retries</h2><p>Conflicts need review; source gaps retry without manual approval.</p></div>
          <span className="ui-badge ui-badge-warning">{reviewQueue.length} pending</span>
        </div>
        {reviewQueue.length === 0 && <p style={{ color: "var(--ink-muted)" }}>Nothing pending review.</p>}
        <div className="review-list">
        {reviewQueue.map((ipo) => {
          const reasons = reviewReasons(ipo);
          const latestOfficial = ipo.officialEvidence[0];
          const needsDecision = ipo.publicationState === "QUARANTINED";
          const filingUrls = [
            ipo.drhpUrl ? { label: "DRHP", url: ipo.drhpUrl } : null,
            ipo.rhpUrl ? { label: "RHP", url: ipo.rhpUrl } : null,
          ].filter((filing): filing is { label: string; url: string } => filing !== null);
          return <article key={ipo.id} className="review-card">
            <div className="review-head">
              <span className={`ui-badge ${ipo.publicationState === "QUARANTINED" ? "ui-badge-critical" : "ui-badge-warning"}`}>
                {ipo.publicationState}
              </span>
              <div><h3>{ipo.company.name}</h3><span>{ipo.board === "SME" ? "SME IPO" : "Mainboard IPO"}</span></div>
            </div>

            <div className={`review-hold ${ipo.publicationState === "QUARANTINED" ? "review-hold-critical" : ""}`}>
              <strong>Why it is held</strong>
              <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>

            <section className="review-fact-grid" aria-label={`Facts for ${ipo.company.name}`}>
              <div><span>Price band</span><strong>₹{ipo.priceBandLow?.toString()}–₹{ipo.priceBandHigh?.toString()}</strong></div>
              <div><span>Lot size</span><strong>{ipo.lotSize ?? "—"}</strong></div>
              <div><span>Issue size</span><strong>₹{ipo.issueSizeCr?.toString() ?? "—"} Cr</strong></div>
              <div><span>Open date</span><strong>{fmtDate(ipo.openDate)}</strong></div>
              <div><span>Listing date</span><strong>{fmtDate(ipo.listingDate)}</strong></div>
              <div><span>Registrar</span><strong>{ipo.registrar ?? "—"}</strong></div>
            </section>

            <section className="review-evidence">
              <div className="review-subhead"><h4>Evidence to check</h4><span>{filingUrls.length + (ipo.sourceUrl ? 1 : 0)} links</span></div>
              <div className="review-evidence-links">
                {filingUrls.map((filing) => (
                  <a key={`${filing.label}-${filing.url}`} href={filing.url} target="_blank" rel="noopener noreferrer">
                    <span><strong>{filing.label}</strong><small>{filingEvidenceLabel(filing.url)} · {filingSourceHost(filing.url)}</small></span><b>↗</b>
                  </a>
                ))}
                {ipo.sourceUrl && <a href={ipo.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <span><strong>Discovery facts</strong><small>IPO Watch · compare dates, price and lot size</small></span><b>↗</b>
                </a>}
              </div>
            </section>

            {latestOfficial?.comparisons.length ? <section className="review-evidence">
              <div className="review-subhead"><h4>Conflicting official fields</h4><span>{latestOfficial.source}</span></div>
              <div className="table-wrap"><table className="dates"><thead><tr><th>Field</th><th>Collected value</th><th>Official value</th><th>Source</th></tr></thead>
                <tbody>{latestOfficial.comparisons.map((comparison) => <tr key={comparison.id}>
                  <td>{comparison.field}</td>
                  <td>{comparison.candidateValue ?? "—"}</td>
                  <td>{comparison.officialValue ?? "—"}</td>
                  <td>{comparison.sourceUrl ? <a href={comparison.sourceUrl} target="_blank" rel="noopener noreferrer">Open NSE ↗</a> : "—"}</td>
                </tr>)}</tbody>
              </table></div>
            </section> : null}

            {needsDecision ? <div className="review-decision-grid">
              <form action={approveIpo} className="review-decision review-approve">
                <input type="hidden" name="id" value={ipo.id} />
                <div><h4>Approve for publishing</h4><p>This makes the IPO visible immediately.</p></div>
                <label className="review-field">
                  <span>Verified company sector <small>(optional)</small></span>
                  <input name="sector" defaultValue={ipo.company.sector ?? ""} placeholder="e.g. Engineering & Capital Goods" />
                  <small>Leave blank if the filing does not make it clear; sector never blocks publication.</small>
                </label>
                <label className="review-check"><input type="checkbox" name="factsChecked" required /> <span>I checked price, dates and lot size.</span></label>
                <label className="review-check"><input type="checkbox" name="evidenceChecked" required /> <span>I opened the filing and confirmed this is the same issuer.</span></label>
                <button type="submit" className="ui-button ui-button-primary">Approve & publish</button>
              </form>

              <details className="review-decision review-reject">
                <summary>Reject this candidate</summary>
                <form action={rejectIpo}>
                  <input type="hidden" name="id" value={ipo.id} />
                  <label className="review-field"><span>Reason</span>
                    <select name="reason" defaultValue="" required>
                      <option value="" disabled>Choose a reason</option>
                      {REJECTION_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
                    </select>
                  </label>
                  <label className="review-field"><span>Notes <small>(required only for Other)</small></span>
                    <textarea name="notes" rows={2} placeholder="What did not match?" />
                  </label>
                  <button type="submit" className="ui-button ui-button-danger">Reject candidate</button>
                </form>
              </details>
            </div> : <div className="review-hold">
              <strong>No action needed</strong>
              <p>The source is outside current official coverage or temporarily incomplete. The pipeline will retry; this cannot be manually approved from incomplete evidence.</p>
            </div>}
          </article>;
        })}
        </div>

        <details className="admin-operations">
          <summary>Pipeline operations and source health</summary>
          <p>Automated discovery runs every two hours. These diagnostics are for investigating source failures—not for approving IPOs.</p>
          <h3>GMP source health</h3>
          <div className="table-wrap"><table className="dates"><thead><tr><th>Source</th><th>Last success</th><th>Failures</th><th>Status</th></tr></thead>
            <tbody>{sources.map((s) => <tr key={s.id}><td>{s.name}</td><td>{fmtDate(s.health?.lastSuccessAt)}</td><td>{s.health?.consecutiveFailures ?? 0}</td><td>{s.health?.degraded ? <span className="status-bad">Degraded</span> : <span className="status-good">Healthy</span>}</td></tr>)}</tbody>
          </table></div>
          <h3>Recent ingestion runs</h3>
          <div className="table-wrap"><table className="dates"><thead><tr><th>Started</th><th>Duration</th><th>Result</th><th>Discovery</th><th>GMP</th></tr></thead>
            <tbody>{recentRuns.map((r) => {
              const summary = r.summary as Record<string, unknown> | null;
              const discovery = summary?.discovery as Record<string, unknown> | undefined;
              const gmp = summary?.gmp as Record<string, unknown> | undefined;
              const durationMs = r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null;
              return <tr key={r.id}><td>{fmtDate(r.startedAt)}</td><td>{durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}</td><td>{r.skippedDueToLock ? "Skipped" : r.ok ? <span className="status-good">OK</span> : <span className="status-bad" title={r.error ?? ""}>Failed</span>}</td><td>{discovery ? `+${discovery.autoPublished ?? 0} public, +${discovery.draftsCreated ?? 0} draft` : "—"}</td><td>{gmp ? `${gmp.snapshotsWritten ?? 0} written` : "—"}</td></tr>;
            })}</tbody>
          </table></div>
        </details>
      </main>
      </div>
    </div>
  );
}
