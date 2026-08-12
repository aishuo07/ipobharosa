"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { processExtractions, syncDocument } from "@/lib/financials/workflow";
import crypto from "crypto";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) throw new Error("Not authorized");
  return email!;
}

export async function submitFinancialData(formData: FormData) {
  const admin = await requireAdmin();

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

  if (!ipoId || !metric || !sourceUrl || isNaN(value)) {
    throw new Error("Missing required fields");
  }

  try {
    // Calculate SHA-256 of source URL (for idempotency)
    const sha256 = crypto.createHash("sha256").update(sourceUrl).digest("hex");

    // Sync document
    const docId = await syncDocument(ipoId, documentType as any, sourceUrl, sha256, pageNumber);

    // Create raw extraction (manually entered)
    const rawValue = `₹${value} ${unit}`;
    const rawExtractions = [
      {
        metric: metric as any,
        originalLabel,
        rawValue,
        fiscalYear,
        scope: scope as any,
        auditStatus: auditStatus as any,
        pageNumber,
        tableReference,
        ocrUsed: false,
        extractionConfidence: 1.0, // Manual entry = high confidence
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
