import { NextResponse } from "next/server";
import { refreshAllCatalogues } from "@/lib/allotment-core/catalogue";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  
  if (process.env.NODE_ENV === "production") {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  
  try {
    await refreshAllCatalogues();
    return NextResponse.json({ success: true, message: "All catalogues refreshed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
