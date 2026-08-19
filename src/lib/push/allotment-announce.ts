import { prisma } from "@/lib/prisma";
import { sendPushBroadcast } from "@/lib/push/expo";
import type { AllotmentLaunchCheck } from "@/lib/allotment-launch";
import { resolveSiteUrl } from "@/lib/site-url";

const SITE_URL = resolveSiteUrl();

/**
 * Announces newly-detected allotment launches via push notification. Dedup
 * is guaranteed by the unique AllotmentAnnouncement.ipoId row: a launch is
 * announced exactly once, no matter how many 15-minute cron runs observe
 * it. Runs before the cron response returns so the caller can surface the
 * count in logs / health.
 */
export async function announceAllotmentLaunches(
  check: AllotmentLaunchCheck,
): Promise<{ announced: number; alreadyAnnounced: number; failed: number }> {
  if (check.launched.length === 0) return { announced: 0, alreadyAnnounced: 0, failed: 0 };

  const summary = { announced: 0, alreadyAnnounced: 0, failed: 0 };

  for (const launch of check.launched) {
    const existing = await prisma.allotmentAnnouncement.findUnique({ where: { ipoId: launch.ipoId } });
    if (existing) {
      summary.alreadyAnnounced++;
      continue;
    }

    try {
      const result = await sendPushBroadcast({
        title: "Allotment result is out",
        body: `${launch.companyName} allotment has been declared (${launch.registrar}). Check your status now.`,
        data: { type: "allotment", ipoId: launch.ipoId, companyName: launch.companyName, url: `${SITE_URL}/ipo/${launch.companyName}` },
      });
      await prisma.allotmentAnnouncement.create({
        data: { ipoId: launch.ipoId, companyName: launch.companyName, registrar: launch.registrar },
      });
      summary.announced++;
      if (result.failed > 0) summary.failed++;
    } catch {
      // Transient failure — the row is not written, so the next cron run
      // will retry the announcement naturally.
      summary.failed++;
    }
  }

  return summary;
}