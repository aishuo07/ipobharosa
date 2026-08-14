import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { loginPathFor } from "@/lib/auth-redirect";
import { REJECTION_REASONS } from "@/lib/admin-review";
import { filingEvidenceClass, filingEvidenceLabel, filingSourceHost } from "@/lib/document-evidence";
import { getEmailReadiness } from "@/lib/email/readiness";
import { resolveSiteUrl } from "@/lib/site-url";
import { acceptOfficialCorrection, approveIpo, ignoreOfficialIncident, rejectIpo, retryOfficialVerification } from "./actions";

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

function retryFeedback(status: string | undefined, company: string | undefined, outcome: string | undefined) {
  if (status === "busy") return { tone: "warning", message: "Another ingestion or retry is already running. Nothing was changed; try again shortly." };
  if (status === "not_retryable") return { tone: "warning", message: "That IPO is no longer in a retryable state. Refresh the queue before trying again." };
  if (status === "completed") {
    const label = outcome ? outcome.replaceAll("_", " ") : "completed";
    return { tone: label === "published" ? "success" : "warning", message: `${company ?? "IPO"}: official-source retry ${label}. The evidence and audit history were saved.` };
  }
  return null;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ retry?: string; company?: string; outcome?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(loginPathFor("/admin"));
  if (!isAdminEmail(session?.user?.email)) notFound();

  const [stateCounts, sources, operationHealth, recentRuns, reviewQueue, openIncidents, excludedIssueTypes] = await Promise.all([
    prisma.ipo.groupBy({ by: ["publicationState"], _count: true }),
    prisma.gmpSource.findMany({ include: { health: true }, orderBy: { name: "asc" } }),
    prisma.sourceOperationHealth.findMany({ orderBy: [{ source: "asc" }, { operation: "asc" }] }),
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
        officialAttempts: { orderBy: { attemptedAt: "desc" }, take: 8 },
      },
      orderBy: { discoveredAt: "desc" },
    }),
    prisma.officialEvidenceIncident.findMany({
      where: { status: "OPEN" },
      include: {
        ipo: {
          include: {
            company: true,
            officialEvidence: {
              orderBy: { capturedAt: "desc" },
              take: 1,
              include: { comparisons: { where: { status: "CONFLICT" }, orderBy: { field: "asc" } } },
            },
          },
        },
      },
      orderBy: [{ kind: "desc" }, { lastSeenAt: "desc" }],
    }),
    prisma.ipo.findMany({
      where: { publicationState: "REJECTED", officialIssueType: { not: null } },
      include: {
        company: true,
        officialAttempts: { orderBy: { attemptedAt: "desc" }, take: 4 },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const countOf = (state: string) => stateCounts.find((s) => s.publicationState === state)?._count ?? 0;
  const published = countOf("PUBLISHED");
  const draft = countOf("DRAFT");
  const quarantined = countOf("QUARANTINED");
  const rejected = countOf("REJECTED");
  const incidentIpoIds = new Set(openIncidents.map((incident) => incident.ipoId));
  const retryQueue = reviewQueue.filter((ipo) => !incidentIpoIds.has(ipo.id));
  const now = new Date();
  const retrying = reviewQueue.filter((ipo) => ipo.officialNextAttemptAt && ipo.officialNextAttemptAt > now).length;
  const due = reviewQueue.length - retrying;
  const degradedSources = operationHealth.filter((health) => health.consecutiveFailures > 0).length;
  const feedback = retryFeedback(params.retry, params.company, params.outcome);
  const emailReadiness = getEmailReadiness();
  const siteUrl = resolveSiteUrl();

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

        {feedback && <div className={`admin-flash admin-flash-${feedback.tone}`} role="status">{feedback.message}</div>}

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

        <section className="pipeline-summary" aria-label="Verification operations summary">
          <div><strong>{retrying}</strong><span>Waiting for retry</span></div>
          <div><strong>{due}</strong><span>Due for verification</span></div>
          <div><strong>{openIncidents.length}</strong><span>Open source conflicts</span></div>
          <div><strong>{degradedSources}</strong><span>Degraded source operations</span></div>
        </section>

        <div className="review-section-head">
          <div><h2>Launch configuration</h2><p>Presence checks only—secret values are never displayed.</p></div>
          <span className={`ui-badge ${emailReadiness.enabled ? "ui-badge-positive" : "ui-badge-warning"}`}>
            {emailReadiness.enabled ? "USER EMAIL READY" : "EMAIL HELD"}
          </span>
        </div>
        <section className="pipeline-summary" aria-label="Site and email readiness">
          <div><strong>{new URL(siteUrl).hostname}</strong><span>Canonical site origin</span></div>
          <div><strong>{emailReadiness.apiKeyConfigured ? "Present" : "Missing"}</strong><span>Resend API key</span></div>
          <div><strong>{emailReadiness.senderConfigured ? "Present" : "Missing"}</strong><span>Verified sender setting</span></div>
          <div><strong>{emailReadiness.featureFlagEnabled ? "Enabled" : "Disabled"}</strong><span>User email feature flag</span></div>
        </section>
        {!emailReadiness.enabled && <div className="admin-flash admin-flash-warning" role="status">
          Email sign-in and watchlist reminders stay hidden until: {emailReadiness.reasons.join("; ")}.
        </div>}

        <div className="review-section-head">
          <div><h2>Official-source incidents</h2><p>Repeated identical conflicts are grouped. Published drift never changes public data until you approve it.</p></div>
          <span className={`ui-badge ${openIncidents.some((incident) => incident.kind === "PUBLISHED_DRIFT") ? "ui-badge-critical" : "ui-badge-warning"}`}>{openIncidents.length} open</span>
        </div>
        {openIncidents.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>No unresolved official-source conflicts or published-value changes.</p> : (
          <div className="review-list">
            {openIncidents.map((incident) => {
              const capture = incident.ipo.officialEvidence[0];
              const comparisons = capture?.comparisons.filter((comparison) => incident.fields.includes(comparison.field)) ?? [];
              return <article key={incident.id} className="review-card">
                <div className="review-head">
                  <span className={`ui-badge ${incident.kind === "PUBLISHED_DRIFT" ? "ui-badge-critical" : "ui-badge-warning"}`}>
                    {incident.kind === "PUBLISHED_DRIFT" ? "PUBLISHED DATA CHANGED" : "SOURCE CONFLICT"}
                  </span>
                  <div><h3>{incident.ipo.company.name}</h3><span>Seen {incident.occurrenceCount} time{incident.occurrenceCount === 1 ? "" : "s"} · last {fmtDate(incident.lastSeenAt)}</span></div>
                </div>
                <div className={`review-hold ${incident.kind === "PUBLISHED_DRIFT" ? "review-hold-critical" : ""}`}>
                  <strong>Why it is held</strong>
                  <ul>{incident.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>
                {comparisons.length > 0 && <div className="table-wrap"><table className="dates"><thead><tr><th>Field</th><th>Current</th><th>Official</th><th>Evidence</th></tr></thead><tbody>
                  {comparisons.map((comparison) => <tr key={comparison.id}><td>{comparison.field}</td><td>{comparison.candidateValue ?? "—"}</td><td>{comparison.officialValue ?? "—"}</td><td>{comparison.sourceUrl ? <a href={comparison.sourceUrl} target="_blank" rel="noopener noreferrer">Open source ↗</a> : "—"}</td></tr>)}
                </tbody></table></div>}
                {incident.kind === "CONFLICT" && <form action={retryOfficialVerification} className="review-retry">
                  <input type="hidden" name="id" value={incident.ipo.id} />
                  <div><strong>Recheck before deciding</strong><span>Runs fresh NSE and BSE checks under the ingestion lock. It never accepts a conflicting value automatically.</span></div>
                  <button type="submit" className="ui-button ui-button-secondary">Retry official sources now</button>
                </form>}
                <div className="review-decision-grid">
                  <form action={acceptOfficialCorrection} className="review-decision review-approve">
                    <input type="hidden" name="incidentId" value={incident.id} />
                    <div><h4>Use official values</h4><p>Updates only the conflicting allowlisted fields and records every old/new value.</p></div>
                    <label className="review-field"><span>Reason</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} placeholder="Why this official correction is accepted" /></label>
                    <label className="review-check"><input type="checkbox" required /><span>I opened the official evidence and checked the values.</span></label>
                    <button type="submit" className="ui-button ui-button-primary">Accept official correction</button>
                  </form>
                  <form action={ignoreOfficialIncident} className="review-decision review-reject">
                    <input type="hidden" name="incidentId" value={incident.id} />
                    <div><h4>Ignore with explanation</h4><p>Use only when the source is wrong or the difference is intentional.</p></div>
                    <label className="review-field"><span>Reason</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} placeholder="Why no data correction is needed" /></label>
                    <button type="submit" className="ui-button ui-button-secondary">Resolve without change</button>
                  </form>
                </div>
              </article>;
            })}
          </div>
        )}

        <div className="review-section-head">
          <div><h2>Exceptions and retries</h2><p>Conflicts need review; source gaps retry without manual approval.</p></div>
          <span className="ui-badge ui-badge-warning">{retryQueue.length} pending</span>
        </div>
        {retryQueue.length === 0 && <p style={{ color: "var(--ink-muted)" }}>Nothing pending review.</p>}
        <div className="review-list">
        {retryQueue.map((ipo) => {
          const reasons = reviewReasons(ipo);
          const latestOfficial = ipo.officialEvidence[0];
          const latestAttempts = ipo.officialAttempts.filter((attempt, index, attempts) =>
            attempts.findIndex((candidate) => candidate.source === attempt.source) === index);
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
              <div><h3>{ipo.company.name}</h3><span>{ipo.board === "SME" ? "SME IPO" : "Mainboard IPO"} · last {fmtDate(ipo.officialLastAttemptAt)} · next {fmtDate(ipo.officialNextAttemptAt)}</span></div>
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

            {latestAttempts.length > 0 && <section className="review-evidence">
              <div className="review-subhead"><h4>Latest provider checks</h4><span>{latestAttempts.length} sources</span></div>
              <div className="table-wrap"><table className="dates"><thead><tr><th>Provider</th><th>Status</th><th>Reason</th><th>Checked</th><th>Source</th></tr></thead>
                <tbody>{latestAttempts.map((attempt) => <tr key={`${attempt.source}-${attempt.attemptedAt.toISOString()}`}>
                  <td>{attempt.source}</td>
                  <td><span className={attempt.status === "FOUND" ? "status-good" : attempt.status === "UNAVAILABLE" ? "status-bad" : ""}>{attempt.status.replaceAll("_", " ")}</span></td>
                  <td>{attempt.reason ?? "Official evidence found"}</td>
                  <td>{fmtDate(attempt.attemptedAt)}</td>
                  <td>{attempt.sourceUrl ? <a href={attempt.sourceUrl} target="_blank" rel="noopener noreferrer">Open ↗</a> : "—"}</td>
                </tr>)}</tbody>
              </table></div>
            </section>}

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

            <form action={retryOfficialVerification} className="review-retry">
              <input type="hidden" name="id" value={ipo.id} />
              <div><strong>Retry official verification now</strong><span>Bypasses only the waiting period. All source matching, conflict rules and audit logging still apply.</span></div>
              <button type="submit" className="ui-button ui-button-secondary">Retry now</button>
            </form>

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

        <div className="review-section-head">
          <div><h2>Excluded issue types</h2><p>Officially classified FPOs, InvITs and other non-IPO issues are retained for audit but never shown as IPOs.</p></div>
          <span className="ui-badge">{excludedIssueTypes.length} excluded</span>
        </div>
        {excludedIssueTypes.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>No officially excluded non-IPO issues.</p> : (
          <div className="table-wrap"><table className="dates"><thead><tr><th>Company</th><th>Official type</th><th>Last checked</th><th>Provider evidence</th></tr></thead><tbody>
            {excludedIssueTypes.map((ipo) => {
              const attempt = ipo.officialAttempts.find((candidate) => candidate.status === "WRONG_ISSUE_TYPE") ?? ipo.officialAttempts[0];
              return <tr key={ipo.id}>
                <td>{ipo.company.name}</td>
                <td>{ipo.officialIssueType ?? "Non-IPO"}</td>
                <td>{fmtDate(ipo.officialLastAttemptAt)}</td>
                <td>{attempt?.sourceUrl ? <a href={attempt.sourceUrl} target="_blank" rel="noopener noreferrer">{attempt.source} source ↗</a> : attempt?.reason ?? "Official classification retained"}</td>
              </tr>;
            })}
          </tbody></table></div>
        )}

        <details className="admin-operations" open>
          <summary>Pipeline operations and source health</summary>
          <p>Automated discovery runs every two hours. These diagnostics are for investigating source failures—not for approving IPOs.</p>
          <h3>GMP source health</h3>
          <div className="table-wrap"><table className="dates"><thead><tr><th>Source</th><th>Last success</th><th>Failures</th><th>Status</th></tr></thead>
            <tbody>{sources.map((s) => <tr key={s.id}><td>{s.name}</td><td>{fmtDate(s.health?.lastSuccessAt)}</td><td>{s.health?.consecutiveFailures ?? 0}</td><td>{s.health?.degraded ? <span className="status-bad">Degraded</span> : <span className="status-good">Healthy</span>}</td></tr>)}</tbody>
          </table></div>
          <h3>Official and ingestion source health</h3>
          <div className="table-wrap"><table className="dates"><thead><tr><th>Source</th><th>Operation</th><th>Last success</th><th>Failures</th><th>Next retry</th><th>Last error</th></tr></thead>
            <tbody>{operationHealth.map((health) => <tr key={health.key}><td>{health.source}</td><td>{health.operation}</td><td>{fmtDate(health.lastSuccessAt)}</td><td>{health.consecutiveFailures}</td><td>{fmtDate(health.nextRetryAt)}</td><td title={health.lastError ?? ""}>{health.lastError ? health.lastError.slice(0, 100) : "—"}</td></tr>)}</tbody>
          </table></div>
          <h3>Recent ingestion runs</h3>
          <div className="table-wrap"><table className="dates"><thead><tr><th>Started</th><th>Duration</th><th>Result</th><th>Discovery</th><th>GMP</th></tr></thead>
            <tbody>{recentRuns.map((r) => {
              const checkpoint = r.summary as Record<string, unknown> | null;
              const summary = (checkpoint?.summary as Record<string, unknown> | undefined) ?? checkpoint;
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
