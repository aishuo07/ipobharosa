import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDocument, processExtractions } from "@/lib/financials/workflow";
import crypto from "crypto";
import type { RawExtraction } from "@/lib/financials/extraction";

const METRICS = ["REVENUE", "PAT", "EPS", "EBITDA", "ASSETS", "NET_WORTH", "BORROWINGS"] as const;
const DOCUMENT_TYPES = ["DRHP", "RHP", "PROSPECTUS", "CORRIGENDUM", "ADDENDUM"] as const;

type FinancialMetric = (typeof METRICS)[number];
type FinancialDocumentType = (typeof DOCUMENT_TYPES)[number];
type FinancialScope = "Consolidated" | "Standalone";
type FinancialAuditStatus = "Audited" | "Restated" | "Provisional";

type SubmittedExtraction = {
  metric: FinancialMetric;
  originalLabel: string;
  rawValue: string;
  fiscalYear: string;
  scope: FinancialScope;
  auditStatus: FinancialAuditStatus;
  pageNumber: number;
  tableReference: string;
  ocrUsed?: boolean;
  extractionConfidence?: number;
};

type SubmissionBody = {
  ipoId: string;
  document: {
    sourceUrl: string;
    documentType: FinancialDocumentType;
    sha256: string;
    pageCount: number;
  };
  extractions: SubmittedExtraction[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseFinancialSubmission(value: unknown): SubmissionBody | null {
  if (!isRecord(value) || typeof value.ipoId !== "string" || !isRecord(value.document) || !Array.isArray(value.extractions)) {
    return null;
  }

  const document = value.document;
  if (
    typeof document.sourceUrl !== "string" ||
    !document.sourceUrl.startsWith("https://") ||
    typeof document.documentType !== "string" ||
    !DOCUMENT_TYPES.includes(document.documentType as FinancialDocumentType) ||
    typeof document.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(document.sha256) ||
    typeof document.pageCount !== "number" ||
    !Number.isInteger(document.pageCount) ||
    document.pageCount < 1
  ) {
    return null;
  }

  const extractions: SubmittedExtraction[] = [];
  for (const item of value.extractions) {
    if (
      !isRecord(item) ||
      typeof item.metric !== "string" ||
      !METRICS.includes(item.metric as FinancialMetric) ||
      typeof item.originalLabel !== "string" ||
      typeof item.rawValue !== "string" ||
      !/(?:\bCr\b|\bMn\b|crores?|millions?)/i.test(item.rawValue) ||
      typeof item.fiscalYear !== "string" ||
      !/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(item.fiscalYear) ||
      (item.scope !== "Consolidated" && item.scope !== "Standalone") ||
      (item.auditStatus !== "Audited" && item.auditStatus !== "Restated" && item.auditStatus !== "Provisional") ||
      typeof item.pageNumber !== "number" ||
      !Number.isInteger(item.pageNumber) ||
      item.pageNumber < 1 ||
      typeof item.tableReference !== "string" ||
      (item.extractionConfidence !== undefined &&
        (typeof item.extractionConfidence !== "number" || item.extractionConfidence < 0 || item.extractionConfidence > 1))
    ) {
      return null;
    }

    extractions.push(item as SubmittedExtraction);
  }

  if (extractions.length === 0 || extractions.length > 500) return null;

  return {
    ipoId: value.ipoId,
    document: {
      sourceUrl: document.sourceUrl,
      documentType: document.documentType as FinancialDocumentType,
      sha256: document.sha256,
      pageCount: document.pageCount,
    },
    extractions,
  };
}

export async function POST(request: NextRequest) {
  if (process.env.ENABLE_EXPERIMENTAL_FINANCIAL_SUBMISSION !== "true") {
    return NextResponse.json({ error: "Experimental financial submission is disabled" }, { status: 404 });
  }

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
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(adminBearerToken);
  if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const body = parseFinancialSubmission(payload);
  if (!body) {
    return NextResponse.json({ error: "Invalid document evidence or extraction payload" }, { status: 400 });
  }

  const { ipoId, document, extractions } = body;

  try {
    // Get IPO to verify it exists
    const ipo = await prisma.ipo.findUnique({
      where: { id: ipoId },
      include: { company: true },
    });

    if (!ipo) {
      return NextResponse.json({ error: "IPO not found" }, { status: 404 });
    }

    // The checksum must represent the downloaded PDF bytes, not a hash of the
    // submitted values. The local extractor supplies this immutable evidence.
    const doc = await syncDocument(
      ipoId,
      document.documentType,
      document.sourceUrl,
      document.sha256,
      document.pageCount,
    );

    // Process all extractions
    const raws: RawExtraction[] = extractions.map((e) => ({
      metric: e.metric,
      originalLabel: e.originalLabel,
      rawValue: e.rawValue,
      fiscalYear: e.fiscalYear,
      scope: e.scope,
      auditStatus: e.auditStatus,
      pageNumber: e.pageNumber,
      tableReference: e.tableReference,
      ocrUsed: e.ocrUsed || false,
      extractionConfidence: e.extractionConfidence ?? 0,
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

/** Lists only captured filings that have not produced extraction candidates. */
export async function GET(request: NextRequest) {
  if (process.env.ENABLE_EXPERIMENTAL_FINANCIAL_SUBMISSION !== "true") {
    return NextResponse.json({ error: "Experimental financial submission is disabled" }, { status: 404 });
  }
  const adminBearerToken = process.env.ADMIN_BEARER_TOKEN;
  const authHeader = request.headers.get("authorization");
  if (!adminBearerToken || !authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tokenBuffer = Buffer.from(authHeader.slice(7));
  const expectedBuffer = Buffer.from(adminBearerToken);
  if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }
  const documents = await prisma.financialDocument.findMany({
    where: { extractions: { none: {} }, isLatestForType: true },
    select: {
      ipoId: true,
      documentType: true,
      sourceUrl: true,
      ipo: { select: { company: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  return NextResponse.json({
    documents: documents.map((document) => ({
      ipoId: document.ipoId,
      companyName: document.ipo.company.name,
      documentType: document.documentType,
      sourceUrl: document.sourceUrl,
    })),
  });
}
