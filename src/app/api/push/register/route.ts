import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing push token" }, { status: 400 });
  }
  if (!token.startsWith("ExponentPushToken[") || !token.endsWith("]")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  await prisma.pushDevice.upsert({
    where: { token },
    create: { token, platform: body.platform ?? null },
    update: { platform: body.platform ?? null, disabled: false, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}