import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFinancialsForAllIpos } from "@/lib/financials/pdf-extraction";
import { syncDocument, processExtractions } from "@/lib/financials/workflow";
import crypto from "crypto";

type ExtractionDetail = {
  ipoName: string;
  source: "RHP" | "DRHP";
  extractionCount: number;
  quality: "HIGH" | "MEDIUM" | "LOW";
  issues: string[];
};

async function calculateSha256(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return crypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

export async function POST(request: NextRequest) {
  const adminBearerToken = process.env.ADMIN_BEARER_TOKEN;
  if (!adminBearerToken) {
    return NextResponse.json({ error: "ADMIN_BEARER_TOKEN not configured" }, { status: 503 });
  }

  // Verify admin bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (token !== adminBearerToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const startTime = Date.now();
  const results = {
    totalIpos: 0,
    extracted: 0,
    synced: 0,
    processed: 0,
    failed: [] as string[],
    details: [] as ExtractionDetail[],
  };

  try {
    // Get all published IPOs
    const ipos = await prisma.ipo.findMany({
      where: { publicationState: "PUBLISHED" },
      include: { company: true },
    });

    results.totalIpos = ipos.length;

    // Extract from PDFs
    const extractionResults = await extractFinancialsForAllIpos(ipos);

    for (const { ipoId, ipoName, result, source } of extractionResults) {
      if (result.rawExtractions.length === 0) {
        results.failed.push(`${ipoName}: No extractions (${result.issues.join(", ")})`);
        continue;
      }

      try {
        // Get document URL (ipoId is already the ID)
        const ipo = ipos.find((i) => i.id === ipoId);
        if (!ipo) {
          results.failed.push(`${ipoName}: IPO not found`);
          continue;
        }

        const docUrl = source === "RHP" ? ipo.rhpUrl : ipo.drhpUrl;
        if (!docUrl) {
          results.failed.push(`${ipoName}: No document URL for ${source}`);
          continue;
        }

        // Calculate SHA-256
        const sha256 = await calculateSha256(docUrl);

        // Sync document (idempotent via SHA-256) — returns document ID
        const docId = await syncDocument(ipoId, source, docUrl, sha256, result.pageCount);
        results.synced++;

        // Process candidates into the mandatory human-review queue.
        await processExtractions(ipoId, docId, result.rawExtractions);
        results.processed++;

        results.details.push({
          ipoName,
          source,
          extractionCount: result.rawExtractions.length,
          quality: result.extractionQuality,
          issues: result.issues,
        });

        results.extracted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.failed.push(`${ipoName}: ${msg}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json(
      {
        success: true,
        elapsed: `${elapsed}s`,
        ...results,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Health check / preview
  const ipos = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED" },
    select: {
      id: true,
      rhpUrl: true,
      drhpUrl: true,
      company: { select: { name: true } },
    },
  });

  return NextResponse.json({
    message: "POST with the configured admin Bearer token to extract financials for all IPOs",
    iposWithUrls: ipos.filter((i) => i.rhpUrl || i.drhpUrl).length,
    totalIpos: ipos.length,
  });
}
