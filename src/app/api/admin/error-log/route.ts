import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { level, message, route, details, userAgent } = body;
    await prisma.errorLog.create({
      data: {
        level: level || "error",
        message: String(message || "").slice(0, 500),
        route: String(route || "").slice(0, 200),
        details: details ? JSON.stringify(details).slice(0, 2000) : null,
        userAgent: String(userAgent || "").slice(0, 300),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const route = searchParams.get("route");
    const where = route ? { route: { contains: route } } : {};
    const logs = await prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json(logs);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
