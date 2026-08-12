import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDocument, processExtractions } from "@/lib/financials/workflow";
import crypto from "crypto";
import type { RawExtraction } from "@/lib/financials/extraction";

const ADMIN_BEARER_TOKEN = process.env.ADMIN_BEARER_TOKEN || "dev-token-123";

export async function POST(request: NextRequest) {
  // Verify admin bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (token !== ADMIN_BEARER_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const body = await request.json();
  const { ipoId, extractions } = body;

  if (!ipoId || !extractions || !Array.isArray(extractions)) {
    return NextResponse.json({ error: "Missing ipoId or extractions" }, { status: 400 });
  }

  try {
    // Get IPO to verify it exists
    const ipo = await prisma.ipo.findUnique({
      where: { id: ipoId },
      include: { company: true },
    });

    if (!ipo) {
      return NextResponse.json({ error: "IPO not found" }, { status: 404 });
    }

    // For extracted data, create a virtual document (SHA-256 of all values)
    const extractedHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(extractions))
      .digest("hex");

    // Create document record
    const doc = await syncDocument(
      ipoId,
      "RHP",
      `extracted://${extractedHash}`,
      extractedHash,
      extractions[0]?.pageNumber || 1
    );

    // Process all extractions
    const raws: RawExtraction[] = extractions.map((e: any) => ({
      metric: e.metric,
      originalLabel: e.originalLabel,
      rawValue: e.rawValue,
      fiscalYear: e.fiscalYear,
      scope: e.scope || "Consolidated",
      auditStatus: e.auditStatus || "Audited",
      pageNumber: e.pageNumber || 1,
      tableReference: e.tableReference || "Extracted",
      ocrUsed: e.ocrUsed || false,
      extractionConfidence: e.extractionConfidence || 0.8,
    }));

    await processExtractions(ipoId, doc, raws);

    return NextResponse.json(
      {
        success: true,
        ipoId,
        ipoName: ipo.company.name,
        extracted: raws.length,
        message: `${raws.length} metrics extracted and routed to review queue`,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Extraction submission error:", msg);
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}
