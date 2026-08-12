import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ipoId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ipoId } = await params;

  const ipo = await prisma.ipo.findUnique({ where: { id: ipoId }, select: { publicationState: true } });
  if (!ipo || ipo.publicationState !== "PUBLISHED") {
    return NextResponse.json({ error: "IPO not found" }, { status: 404 });
  }

  await prisma.watchlistItem.upsert({
    where: { userId_ipoId: { userId: session.user.id, ipoId } },
    update: {},
    create: { userId: session.user.id, ipoId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ipoId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ipoId } = await params;

  await prisma.watchlistItem.deleteMany({
    where: { userId: session.user.id, ipoId },
  });

  return NextResponse.json({ ok: true });
}
