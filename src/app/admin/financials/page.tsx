import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { approveFinancialRevision, rejectFinancialRevision } from "./actions";

export const revalidate = 0;

function fmtMetric(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
}

export default async function FinancialsReviewPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const pending = await prisma.financialRevision.findMany({
    where: {
      state: { in: ["AUTO_VERIFIED", "REVIEW_REQUIRED"] },
    },
    include: {
      extraction: {
        include: {
          document: { include: { ipo: { include: { company: true } } } },
        },
      },
    },
    orderBy: [
      { state: "asc" }, // REVIEW_REQUIRED first
      { createdAt: "desc" },
    ],
  });

  const stats = {
    autoVerified: pending.filter((r) => r.state === "AUTO_VERIFIED").length,
    reviewRequired: pending.filter((r) => r.state === "REVIEW_REQUIRED").length,
  };

  return (
    <div className="wrap">
      <div className="legal-head">
        <Link href="/admin" className="legal-back">
          ← Pipeline
        </Link>
      </div>
      <div className="legal-wrap" style={{ maxWidth: 1200 }}>
        <h1>Financial Review Queue</h1>
        <div className="legal-updated">
          Signed in as {session!.user!.email} — {pending.length} pending ({stats.reviewRequired} review required,{" "}
          {stats.autoVerified} legacy auto-verified records still requiring sign-off)
        </div>

        {pending.length === 0 && (
          <p style={{ color: "var(--ink-muted)", marginTop: 20 }}>
            No pending financial revisions. All extracted data has been approved or rejected.
          </p>
        )}

        {pending.map((rev) => {
          const ext = rev.extraction;
          const doc = ext.document;
          const ipo = doc.ipo;
          const mismatchColor =
            rev.mismatchPercent && rev.mismatchPercent > 0.5 ? "var(--critical)" : rev.mismatchPercent ? "var(--warning)" : "var(--good)";

          return (
            <div
              key={rev.id}
              style={{
                border: `2px solid ${rev.state === "REVIEW_REQUIRED" ? "var(--critical)" : "var(--warning)"}`,
                borderRadius: 4,
                padding: 16,
                marginBottom: 16,
                background: "var(--surface)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 2,
                    background: rev.state === "REVIEW_REQUIRED" ? "var(--critical)" : "var(--warning)",
                    color: "white",
                  }}
                >
                  {rev.state === "REVIEW_REQUIRED" ? "NEEDS REVIEW" : "LEGACY — REVIEW REQUIRED"}
                </span>
                <strong>{ipo.company.name}</strong>
                <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>({ipo.board})</span>
                <span style={{ fontSize: 12, color: "var(--ink-muted)", marginLeft: "auto" }}>
                  From: {doc.documentType}
                </span>
              </div>

              {/* Metric + Fiscal Year */}
              <div style={{ fontSize: 13, marginBottom: 16, color: "var(--ink-muted)" }}>
                <strong>{fmtMetric(ext.metric)}</strong> for FY {ext.fiscalYear} ({ext.scope}, {ext.auditStatus})
              </div>

              {/* Evidence Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                  padding: 12,
                  background: "var(--surface-2)",
                  borderRadius: 4,
                }}
              >
                {/* Left: Extracted Value */}
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 4 }}>EXTRACTED VALUE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                    {fmtValue(ext.normalizedValue ? Number(ext.normalizedValue) : null)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-muted)", marginBottom: 8 }}>
                    <div>Raw: {ext.rawValue}</div>
                    <div>Label: {ext.originalLabel}</div>
                    <div>Page {ext.pageNumber}, {ext.tableReference || "table ref unknown"}</div>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <div>Extraction confidence: {(ext.extractionConfidence * 100).toFixed(0)}%</div>
                    {ext.ocrUsed && (
                      <div style={{ color: "var(--warning)" }}>
                        OCR used (confidence: {(ext.ocrConfidence ?? 0 * 100).toFixed(0)}%)
                      </div>
                    )}
                  </div>
                  {ext.validationIssues.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--critical)" }}>
                      <strong>Validation issues:</strong>
                      <ul style={{ margin: "4px 0 0 16px", paddingLeft: 0 }}>
                        {ext.validationIssues.map((issue: string, i: number) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Right: Comparison + Document Link */}
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 4 }}>
                    COMPARISON {rev.existingValue ? "TO PUBLISHED" : "— NO PRIOR VALUE"}
                  </div>
                  {rev.existingValue ? (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: mismatchColor }}>
                        {fmtValue(rev.existingValue ? Number(rev.existingValue) : null)}
                      </div>
                      <div style={{ fontSize: 11, marginBottom: 8 }}>
                        <div style={{ color: mismatchColor, fontWeight: 600 }}>
                          {rev.mismatchPercent ? `${rev.mismatchPercent.toFixed(2)}% difference` : "Matches"}
                        </div>
                        <div style={{ color: "var(--ink-faint)" }}>
                          Previously published from {rev.existingSource || "unknown source"}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                      First time this metric is being published for this fiscal year.
                    </div>
                  )}

                  <div style={{ marginTop: 12, fontSize: 11 }}>
                    <strong>Official document:</strong>
                    <div style={{ marginTop: 4 }}>
                      <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                        {doc.documentType} ↗
                      </a>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>
                      From: {doc.sourceHost}
                      <br />
                      Fetched: {doc.fetchedAt.toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Notes (if any) */}
              {rev.validationNotes && (
                <div
                  style={{
                    fontSize: 12,
                    padding: 10,
                    marginBottom: 16,
                    background: "var(--critical)",
                    color: "white",
                    borderRadius: 2,
                  }}
                >
                  <strong>Validation notes:</strong> {rev.validationNotes}
                </div>
              )}

              {/* Action Forms */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <form action={approveFinancialRevision} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="revisionId" value={rev.id} />
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    ✓ Approve & Publish
                  </button>
                </form>
                <form action={rejectFinancialRevision} style={{ display: "flex", gap: 6, flex: 1 }}>
                  <input type="hidden" name="revisionId" value={rev.id} />
                  <input
                    name="reason"
                    placeholder="Reason (e.g., 'OCR corruption', 'mismatch needs investigation')"
                    required
                    className="btn"
                    style={{ fontWeight: 400, flex: 1 }}
                  />
                  <button type="submit" className="btn btn-ghost">
                    ✗ Reject
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
