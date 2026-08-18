import { prisma } from "@/lib/prisma";

export type StatusTransition = {
  ipoId: string;
  companyName: string;
  from: "UPCOMING" | "OPEN" | "CLOSED";
  to: "OPEN" | "CLOSED" | "LISTED";
  listingPrice?: number;
};

/**
 * Advances IPO status as real dates pass. CLOSED -> LISTED is handled
 * separately by syncIpoListings (src/lib/ipo-listing.ts), which only fires
 * once NSE publishes the real post-allotment listing price.
 */
export async function syncIpoStatuses(now: Date = new Date()): Promise<StatusTransition[]> {
  const transitions: StatusTransition[] = [];

  const readyToOpen = await prisma.ipo.findMany({
    where: { status: "UPCOMING", openDate: { lte: now } },
    include: { company: true },
  });
  for (const ipo of readyToOpen) {
    await prisma.ipo.update({ where: { id: ipo.id }, data: { status: "OPEN" } });
    transitions.push({ ipoId: ipo.id, companyName: ipo.company.name, from: "UPCOMING", to: "OPEN" });
  }

  const readyToClose = await prisma.ipo.findMany({
    where: { status: "OPEN", closeDate: { lte: now } },
    include: { company: true },
  });
  for (const ipo of readyToClose) {
    await prisma.ipo.update({ where: { id: ipo.id }, data: { status: "CLOSED" } });
    transitions.push({ ipoId: ipo.id, companyName: ipo.company.name, from: "OPEN", to: "CLOSED" });
  }

  return transitions;
}
