import { prisma } from "@/lib/prisma";

export type StatusTransition = {
  ipoId: string;
  companyName: string;
  from: "UPCOMING" | "OPEN";
  to: "OPEN" | "CLOSED";
};

/**
 * Advances IPO status as real dates pass. CLOSED -> LISTED is
 * deliberately not handled here — it requires a real listing price,
 * which isn't scraped automatically yet, so that transition stays
 * manual rather than firing without real data.
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
