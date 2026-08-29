import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, message, email, userAgent } = body;

    if (!message || message.trim().length < 5) {
      return NextResponse.json({ ok: false, error: "Message too short" }, { status: 400 });
    }

    // Log to console for now (could integrate with GitHub Issues API later)
    console.log("[FEEDBACK]", {
      type: type || "general",
      message: message.substring(0, 1000),
      email: email || "anonymous",
      userAgent: userAgent || "unknown",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
