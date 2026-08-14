import { prisma } from "@/lib/prisma";
import { acquireIngestionLock, releaseIngestionLock } from "@/lib/ingestion/lock";
import { revalidateCandidateById, type RevalidationResult } from "./revalidate";

export type RetryOfficialVerificationResult =
  | { status: "BUSY" }
  | { status: "NOT_RETRYABLE" }
  | { status: "COMPLETED"; result: RevalidationResult };

export async function retryOfficialVerificationNow(
  ipoId: string,
  actor: string,
): Promise<RetryOfficialVerificationResult> {
  const acquired = await acquireIngestionLock(`admin-retry:${actor}`);
  if (!acquired) return { status: "BUSY" };

  try {
    const result = await revalidateCandidateById(ipoId);
    if (result.outcome === "EMPTY") return { status: "NOT_RETRYABLE" };

    await prisma.correctionLog.create({
      data: {
        entityType: "Ipo",
        entityId: ipoId,
        action: "retry-official-verification",
        performedBy: actor,
        note: `Official source retry completed with outcome ${result.outcome}${result.reasons.length ? `: ${result.reasons.join("; ")}` : ""}`,
      },
    });
    return { status: "COMPLETED", result };
  } finally {
    await releaseIngestionLock();
  }
}
