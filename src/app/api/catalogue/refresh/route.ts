import { NextRequest, NextResponse } from "next/server";
import { refreshCatalogue, getCatalogue } from "@/lib/allotment-core/catalogue";
import type { RegistrarKey } from "@/lib/allotment-core/catalogue/types";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registrar = searchParams.get("registrar") as RegistrarKey | null;
  
  try {
    if (registrar) {
      await refreshCatalogue(registrar);
      return NextResponse.json({ success: true, registrar, refreshed: true });
    } else {
      await refreshCatalogue();
      return NextResponse.json({ success: true, allRefreshed: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registrar = searchParams.get("registrar") as RegistrarKey | null;
  
  try {
    if (registrar) {
      const data = await getCatalogue(registrar, { force: false });
      return NextResponse.json({ success: true, registrar, count: data.length });
    } else {
      const all = await Promise.all(
        (["kfin", "bigshare", "maashitla", "mufg"] as RegistrarKey[]).map(async (key) => ({
          registrar: key,
          count: (await getCatalogue(key)).length,
        }))
      );
      return NextResponse.json({ success: true, catalogues: all });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
