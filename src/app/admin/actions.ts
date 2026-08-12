"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { validateApprovalInput, validateRejectionInput } from "@/lib/admin-review";

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
