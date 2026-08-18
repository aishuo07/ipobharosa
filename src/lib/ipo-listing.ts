import { prisma } from "@/lib/prisma";
import { NseOfficialSource } from "@/lib/discovery/official/nse";
import type { StatusTransition } from "@/lib/ipo-status";

/**
 * Finishes CLOSED -> LISTED using NSE's public past-issues catalogue, which
 * publishes the real post-allotment issue price once an IPO lists. Only
 * transitions IPOs whose listing date has passed AND for which NSE reports
 * a real price, so LISTED never fires on stale placeholder data.
 */
export async function syncIpoListings(
  now: Date = new Date(),
  source: Pick<NseOfficialSource, "findListing"> = new NseOfficialSource(),
): Promise<StatusTransition[]> {
  const transitions: StatusTransition[] = [];

  const closedIpos = await prisma.ipo.findMany({
    where: { status: "CLOSED", listingDate: { lte: now } },
    include: { company: true },
  });
  if (closedIpos.length === 0) return transitions;

  for (const ipo of closedIpos) {
    let listing: { listingPrice: number; listingDate: Date } | null;
    try {
      listing = await source.findListing(ipo.company.name);
    } catch (error) {
      // A single NSE failure shouldn't block the whole batch; skip and let
      // the next cycle retry. Source outages are surfaced via health checks.
      console.error(`ipo-listing: NSE lookup failed for ${ipo.company.name}:`, error);
      continue;
    }
    if (!listing || listing.listingDate.getTime() > now.getTime()) continue;

    await prisma.ipo.update({
      where: { id: ipo.id },
      data: { status: "LISTED", listingPrice: listing.listingPrice, listingDate: listing.listingDate },
    });
    transitions.push({ ipoId: ipo.id, companyName: ipo.company.name, from: "CLOSED", to: "LISTED", listingPrice: listing.listingPrice });
  }

  return transitions;
}