"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { validateApprovalInput, validateRejectionInput } from "@/lib/admin-review";
import { officialCorrectionData } from "@/lib/admin-correction";
import { retryOfficialVerificationNow } from "@/lib/discovery/retry-operation";
import { toIpoSlug } from "@/lib/ipo-slug";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) throw new Error("Not authorized");
  return email!;
}

export async function approveIpo(formData: FormData) {
  const performedBy = await requireAdmin();
  const id = formData.get("id") as string;
  const sector = validateApprovalInput({
    sector: formData.get("sector") as string | null,
    factsChecked: formData.get("factsChecked") === "on",
    evidenceChecked: formData.get("evidenceChecked") === "on",
  });

  const ipo = await prisma.ipo.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.ipo.update({
      where: { id },
      data: { publicationState: "PUBLISHED", reviewedBy: performedBy, reviewedAt: new Date() },
    }),
    ...(sector ? [prisma.company.update({ where: { id: ipo.companyId }, data: { sector } })] : []),
    prisma.correctionLog.create({
      data: { entityType: "Ipo", entityId: id, action: "publish", performedBy, note: sector ? `sector: ${sector}` : "sector left for optional enrichment" },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function rejectIpo(formData: FormData) {
  const performedBy = await requireAdmin();
  const id = formData.get("id") as string;
  const reason = validateRejectionInput({
    reason: formData.get("reason") as string | null,
    notes: formData.get("notes") as string | null,
  });

  await prisma.$transaction([
    prisma.ipo.update({
      where: { id },
      data: { publicationState: "REJECTED", reviewedBy: performedBy, reviewedAt: new Date() },
    }),
    prisma.correctionLog.create({
      data: { entityType: "Ipo", entityId: id, action: "reject", performedBy, note: reason },
    }),
  ]);

  revalidatePath("/admin");
}

function requiredReason(formData: FormData): string {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10 || reason.length > 500) throw new Error("Provide a correction reason between 10 and 500 characters");
  return reason;
}

function requiredIpoId(formData: FormData): string {
  const id = String(formData.get("id") ?? "").trim();
  if (!id || id.length > 100) throw new Error("A valid IPO ID is required");
  return id;
}

export async function retryOfficialVerification(formData: FormData): Promise<never> {
  const performedBy = await requireAdmin();
  const id = requiredIpoId(formData);
  const result = await retryOfficialVerificationNow(id, performedBy);

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/api/calendar");
  revalidatePath("/watchlist");

  const params = new URLSearchParams({ retry: result.status.toLowerCase() });
  if (result.status === "COMPLETED") {
    params.set("outcome", result.result.outcome.toLowerCase());
    if (result.result.company) {
      params.set("company", result.result.company);
      revalidatePath(`/ipo/${toIpoSlug(result.result.company)}`);
    }
  }
  redirect(`/admin?${params.toString()}`);
}

export async function acceptOfficialCorrection(formData: FormData) {
  const performedBy = await requireAdmin();
  const incidentId = String(formData.get("incidentId") ?? "");
  const reason = requiredReason(formData);
  const incident = await prisma.officialEvidenceIncident.findUniqueOrThrow({
    where: { id: incidentId },
    include: { ipo: true },
  });
  if (incident.status !== "OPEN") throw new Error("This incident is already resolved");

  const capture = await prisma.officialEvidenceCapture.findFirst({
    where: {
      ipoId: incident.ipoId,
      source: incident.source,
      comparisons: { some: { status: "CONFLICT", field: { in: incident.fields } } },
    },
    orderBy: { capturedAt: "desc" },
    include: { comparisons: { where: { status: "CONFLICT", field: { in: incident.fields } } } },
  });
  if (!capture || capture.comparisons.length === 0) throw new Error("Latest official conflict evidence is unavailable");
  const correction = officialCorrectionData(capture.comparisons);

  await prisma.$transaction(async (tx) => {
    await tx.ipo.update({
      where: { id: incident.ipoId },
      data: {
        ...correction.data,
        publicationState: "PUBLISHED",
        quarantineReason: null,
        reviewedBy: performedBy,
        reviewedAt: new Date(),
        officialCheckAttempts: 0,
        officialNextAttemptAt: null,
      },
    });
    if (correction.companyName) {
      await tx.company.update({ where: { id: incident.ipo.companyId }, data: { name: correction.companyName } });
    }
    await tx.officialEvidenceIncident.update({
      where: { id: incident.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: performedBy, resolutionNote: reason },
    });
    for (const comparison of capture.comparisons) {
      await tx.correctionLog.create({
        data: {
          entityType: comparison.field === "companyName" ? "Company" : "Ipo",
          entityId: comparison.field === "companyName" ? incident.ipo.companyId : incident.ipoId,
          action: incident.kind === "PUBLISHED_DRIFT" ? "resolve-published-drift" : "accept-official-correction",
          fieldName: comparison.field,
          oldValue: comparison.candidateValue,
          newValue: comparison.officialValue,
          performedBy,
          note: reason,
        },
      });
    }
    if (correction.fields.includes("rhpUrl") && typeof correction.data.rhpUrl === "string") {
      const exists = await tx.document.findFirst({ where: { ipoId: incident.ipoId, url: correction.data.rhpUrl } });
      if (!exists) await tx.document.create({
        data: { ipoId: incident.ipoId, label: "Official RHP / Prospectus", url: correction.data.rhpUrl, docType: "rhp" },
      });
    }
  });

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function ignoreOfficialIncident(formData: FormData) {
  const performedBy = await requireAdmin();
  const incidentId = String(formData.get("incidentId") ?? "");
  const reason = requiredReason(formData);
  await prisma.officialEvidenceIncident.update({
    where: { id: incidentId, status: "OPEN" },
    data: { status: "IGNORED", resolvedAt: new Date(), resolvedBy: performedBy, resolutionNote: reason },
  });
  revalidatePath("/admin");
}

export async function sendManualPush(formData: FormData): Promise<void> {
  await requireAdmin();
  const title = (formData.get("title") as string | null)?.trim();
  const body = (formData.get("body") as string | null)?.trim();
  const target = formData.get("target") as string | null;

  if (!title || !body) throw new Error("Title and message are required.");

  const { sendPushBroadcast } = await import("@/lib/push/expo");
  const result = await sendPushBroadcast({ title, body, data: { type: target === "allotment" ? "allotment" : "manual" } });
  if (result.failed > 0 && result.accepted === 0) throw new Error("Push send failed for all devices.");
  revalidatePath("/admin");
}
