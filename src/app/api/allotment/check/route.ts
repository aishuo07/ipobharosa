import { NextResponse } from "next/server";
import { getPublicIpos } from "@/lib/board-data";
import { checkAllotmentForPans } from "@/lib/allotment-core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, pans } = body;
    if (!slug || !Array.isArray(pans) || pans.length === 0) {
      return NextResponse.json({ error: "slug and pans[] required" }, { status: 400 });
    }
    const ipos = await getPublicIpos();
    const ipo = ipos.find((item) => item.slug === slug);
    if (!ipo) {
      return NextResponse.json({ error: "IPO not found" }, { status: 404 });
    }
    const results = await checkAllotmentForPans(ipo, pans);
    return NextResponse.json(results, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
