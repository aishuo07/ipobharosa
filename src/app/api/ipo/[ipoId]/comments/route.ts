import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ipoId: string }> },
) {
  const { ipoId } = await params;

  const ipo = await prisma.ipo.findUnique({ where: { id: ipoId }, select: { publicationState: true } });
  if (!ipo || ipo.publicationState !== "PUBLISHED") {
    return NextResponse.json({ error: "IPO not found" }, { status: 404 });
  }

  const session = await auth();

  const comments = await prisma.ipoComment.findMany({
    where: { ipoId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      body: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  return NextResponse.json({
    comments: comments.map(({ userId, ...c }) => ({
      ...c,
      canDelete: session?.user?.id != null && userId === session.user.id,
    })),
  });
}

export async function POST(
  request: Request,
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

  let body = "";
  try {
    const json = await request.json();
    body = typeof json.body === "string" ? json.body.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.length === 0) {
    return NextResponse.json({ error: "Comment is empty" }, { status: 400 });
  }
  if (body.length > 500) {
    return NextResponse.json({ error: "Comment too long (max 500 characters)" }, { status: 400 });
  }

  const comment = await prisma.ipoComment.create({
    data: { ipoId, userId: session.user.id, body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return NextResponse.json({ comment: { ...comment, canDelete: true } }, { status: 201 });
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

  const { searchParams } = new URL(_request.url);
  const commentId = searchParams.get("id");
  if (!commentId) {
    return NextResponse.json({ error: "Missing comment id" }, { status: 400 });
  }

  const deleted = await prisma.ipoComment.deleteMany({
    where: { id: commentId, ipoId, userId: session.user.id },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}