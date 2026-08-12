"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) throw new Error("Not authorized");
  return email!;
}

export async function approveIpo(formData: FormData) {
  const performedBy = await requireAdmin();
  const id = formData.get("id") as string;
  const sector = (formData.get("sector") as string | null)?.trim();
  if (!sector) throw new Error("Sector is required to approve");

  const ipo = await prisma.ipo.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.ipo.update({
      where: { id },
      data: { publicationState: "PUBLISHED", reviewedBy: performedBy, reviewedAt: new Date() },
    }),
    prisma.company.update({ where: { id: ipo.companyId }, data: { sector } }),
    prisma.correctionLog.create({
      data: { entityType: "Ipo", entityId: id, action: "publish", performedBy, note: `sector: ${sector}` },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function rejectIpo(formData: FormData) {
  const performedBy = await requireAdmin();
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string | null)?.trim();
  if (!reason) throw new Error("A reason is required to reject");

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
