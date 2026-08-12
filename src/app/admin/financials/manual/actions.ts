"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { processExtractions, syncDocument } from "@/lib/financials/workflow";
import type { RawExtraction } from "@/lib/financials/extraction";
import crypto from "crypto";

const METRICS = ["REVENUE", "PAT", "EPS", "EBITDA", "ASSETS", "NET_WORTH", "BORROWINGS"] as const;
const DOCUMENT_TYPES = ["DRHP", "RHP", "PROSPECTUS", "CORRIGENDUM", "ADDENDUM"] as const;
const SCOPES = ["Consolidated", "Standalone"] as const;
const AUDIT_STATUSES = ["Audited", "Restated", "Provisional"] as const;

type FinancialMetric = (typeof METRICS)[number];
type FinancialDocumentType = (typeof DOCUMENT_TYPES)[number];

function oneOf<const T extends readonly string[]>(value: string, values: T, field: string): T[number] {
  if (!values.includes(value)) throw new Error(`Invalid ${field}`);
  return value as T[number];
}

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) throw new Error("Not authorized");
  return email!;
}

export async function submitFinancialData(formData: FormData) {
  await requireAdmin();

  const ipoId = formData.get("ipoId") as string;
  const metric = formData.get("metric") as string;
  const value = parseFloat(formData.get("value") as string);
  const unit = formData.get("unit") as string;
  const fiscalYear = formData.get("fiscalYear") as string;
  const scope = formData.get("scope") as string;
  const auditStatus = formData.get("auditStatus") as string;
  const documentType = formData.get("documentType") as string;
  const sourceUrl = formData.get("sourceUrl") as string;
  const pageNumber = parseInt(formData.get("pageNumber") as string);
  const tableReference = formData.get("tableReference") as string;
  const originalLabel = formData.get("originalLabel") as string;

  if (!ipoId || !metric || !sourceUrl || isNaN(value) || !Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("Missing required fields");
  }

  const validatedMetric = oneOf(metric, METRICS, "metric") as FinancialMetric;
  const validatedDocumentType = oneOf(documentType, DOCUMENT_TYPES, "document type") as FinancialDocumentType;
  const validatedScope = oneOf(scope, SCOPES, "scope");
  const validatedAuditStatus = oneOf(auditStatus, AUDIT_STATUSES, "audit status");
  const validatedUnit = oneOf(unit, ["Cr", "Mn"] as const, "unit");

  try {
    // Calculate SHA-256 of source URL (for idempotency)
    // Until document ingestion downloads and checksums the actual PDF, include
    // the IPO and document type so the same source URL cannot cross-link two
    // different records accidentally.
    const sha256 = crypto.createHash("sha256").update(`${ipoId}:${validatedDocumentType}:${sourceUrl}`).digest("hex");

    // Sync document
    const docId = await syncDocument(ipoId, validatedDocumentType, sourceUrl, sha256, null);

    // Create raw extraction (manually entered)
    const rawValue = `₹${value} ${validatedUnit}`;
    const rawExtractions: RawExtraction[] = [
      {
        metric: validatedMetric,
        originalLabel,
        rawValue,
        fiscalYear,
        scope: validatedScope,
        auditStatus: validatedAuditStatus,
        pageNumber,
        tableReference,
        ocrUsed: false,
        extractionConfidence: 1.0,
      },
    ];

    // Process through workflow
    await processExtractions(ipoId, docId, rawExtractions);

    revalidatePath("/admin/financials");
    revalidatePath("/admin");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to submit: ${msg}`);
  }
}
