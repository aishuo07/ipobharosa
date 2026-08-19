import { NextRequest, NextResponse } from "next/server";
import { getCatalogue } from "@/lib/allotment-core/catalogue";
import type { RegistrarKey } from "@/lib/allotment-core/catalogue/types";

export const dynamic = "force-dynamic";

const VALID_REGISTRARS: RegistrarKey[] = ["kfin", "bigshare", "maashitla", "mufg"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registrar = searchParams.get("registrar") as RegistrarKey | null;
  try {
    if (!registrar || !VALID_REGISTRARS.includes(registrar)) {
      const all = await Promise.all(
        VALID_REGISTRARS.map(async (key) => ({
          registrar: key,
          companies: await getCatalogue(key),
        }))
      );
      return NextResponse.json({ success: true, catalogues: all });
    }
    const companies = await getCatalogue(registrar);
    return NextResponse.json({ success: true, registrar, count: companies.length, companies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}