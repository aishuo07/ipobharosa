"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { applyPendingFinancialClassification, approveRevision, publishSafeDocumentBatch, rejectRevision } from "@/lib/financials/workflow";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) throw new Error("Not authorized");
  return email!;
}

export async function approveFinancialRevision(formData: FormData) {
  const approver = await requireAdmin();
  const revisionId = formData.get("revisionId") as string;

  if (!revisionId) throw new Error("Revision ID required");

  await approveRevision(revisionId, approver);

  revalidatePath("/admin/financials");
  revalidatePath("/admin");
}

export async function publishSafeFinancialBatch(formData: FormData) {
  const approver = await requireAdmin();
  const documentId = formData.get("documentId") as string;
  if (!documentId) throw new Error("Document ID required");

  await publishSafeDocumentBatch(documentId, approver);

  revalidatePath("/admin/financials");
  revalidatePath("/admin");
}

export async function applyFinancialClassification() {
  const admin = await requireAdmin();
  await applyPendingFinancialClassification(admin);
  revalidatePath("/admin/financials");
  revalidatePath("/admin");
}

export async function rejectFinancialRevision(formData: FormData) {
  const rejecter = await requireAdmin();
  const revisionId = formData.get("revisionId") as string;
  const reason = (formData.get("reason") as string | null)?.trim();

  if (!revisionId) throw new Error("Revision ID required");
  if (!reason) throw new Error("Reason is required to reject");

  await rejectRevision(revisionId, rejecter, reason);

  revalidatePath("/admin/financials");
  revalidatePath("/admin");
}
