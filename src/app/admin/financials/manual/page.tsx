import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { submitFinancialData } from "./actions";

export const revalidate = 0;

export default async function ManualFinancialEntryPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  // Get all published IPOs for dropdown
  const ipos = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED" },
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

  const metrics = ["REVENUE", "PAT", "EBITDA", "ASSETS", "NET_WORTH", "BORROWINGS", "EPS"];
  const units = ["Cr", "Mn"];
  const auditStatuses = ["Audited", "Provisional", "Restated"];
  const sources = ["RHP", "DRHP", "PROSPECTUS", "CORRIGENDUM", "ADDENDUM"];

  return (
    <div className="wrap">
      <div className="legal-head">
        <Link href="/admin" className="legal-back">
          ← Admin
        </Link>
      </div>
      <div className="legal-wrap" style={{ maxWidth: 900 }}>
        <h1>📊 Financial Data Entry</h1>
        <p style={{ color: "var(--ink-muted)", marginBottom: 20 }}>
          Enter financial metrics for IPOs. Each entry is validated, routed to approval queue, then published immutably.
        </p>

        <form action={submitFinancialData} style={{ display: "grid", gap: 20 }}>
          {/* IPO Selection */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>IPO</legend>
            <select
              name="ipoId"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              <option value="">Select an IPO...</option>
              {ipos.map((ipo) => (
                <option key={ipo.id} value={ipo.id}>
                  {ipo.company.name} ({ipo.status})
                </option>
              ))}
            </select>
          </fieldset>

          {/* Financial Metric */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Metric</legend>
            <select
              name="metric"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              <option value="">Select metric...</option>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </fieldset>

          {/* Value & Unit */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Value</legend>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <input
                type="number"
                name="value"
                placeholder="e.g., 3449.96"
                step="0.01"
                min="0"
                max="999999999"
                required
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
              <select
                name="unit"
                required
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* Fiscal Year & Scope */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Fiscal Context</legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input
                type="text"
                name="fiscalYear"
                placeholder="e.g., 31 Mar 2026"
                required
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
              <select
                name="scope"
                required
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              >
                <option value="Consolidated">Consolidated</option>
                <option value="Standalone">Standalone</option>
              </select>
            </div>
          </fieldset>

          {/* Audit Status */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Audit Status</legend>
            <select
              name="auditStatus"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {auditStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>

          {/* Document Source */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Document Source</legend>
            <select
              name="documentType"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>

          {/* Document URL & Evidence */}
          <fieldset style={{ border: "1px solid var(--border)", padding: 16, borderRadius: 4 }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Document Evidence</legend>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                type="url"
                name="sourceUrl"
                placeholder="RHP/DRHP URL (e.g., https://...file.pdf)"
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input
                  type="number"
                  name="pageNumber"
                  placeholder="Page number"
                  min="1"
                  required
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 14,
                  }}
                />
                <input
                  type="text"
                  name="tableReference"
                  placeholder="e.g., Table 5.1 - Consolidated Revenue"
                  required
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 14,
                  }}
                />
              </div>
              <input
                type="text"
                name="originalLabel"
                placeholder="Exact label from PDF (e.g., 'Revenue from Operations (Net)')"
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
            </div>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 600 }}
          >
            📨 Submit to Review Queue
          </button>
        </form>

        <div style={{ marginTop: 40, padding: 16, background: "var(--surface-2)", borderRadius: 4, fontSize: 12, color: "var(--ink-muted)" }}>
          <strong>Workflow:</strong> Entry → Normalized → Validated → AUTO_VERIFIED or REVIEW_REQUIRED → Admin approves at{" "}
          <Link href="/admin/financials" style={{ color: "var(--accent)" }}>
            /admin/financials
          </Link>{" "}
          → Immutable PUBLISHED record
        </div>
      </div>
    </div>
  );
}
