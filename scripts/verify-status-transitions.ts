import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  // Dynamic import, not static — static imports are hoisted above this
  // file's loadEnv() call, so @/lib/prisma's module-level adapter
  // construction would read DATABASE_URL before it's actually set.
  const { prisma } = await import("../src/lib/prisma");
  const { syncIpoStatuses } = await import("../src/lib/ipo-status");

  const company = await prisma.company.create({
    data: { name: "Test Transition Co", sector: "Test" },
  });

  try {
    const ipo = await prisma.ipo.create({
      data: {
        companyId: company.id,
        status: "UPCOMING",
        board: "MAINBOARD",
        priceBandLow: 100,
        priceBandHigh: 110,
        lotSize: 10,
        issueSizeCr: 50,
        openDate: new Date(Date.now() - 3600000),
        closeDate: new Date(Date.now() + 86400000),
        allotmentDate: new Date(Date.now() + 2 * 86400000),
        refundDate: new Date(Date.now() + 2 * 86400000),
        listingDate: new Date(Date.now() + 4 * 86400000),
      },
    });

    try {
      const transitions = await syncIpoStatuses();
      console.log("transitions found:", JSON.stringify(transitions.filter((t) => t.ipoId === ipo.id)));

      const updated = await prisma.ipo.findUnique({ where: { id: ipo.id } });
      console.log("status after sync:", updated?.status);
    } finally {
      // Real-DB test data must never survive the run, success or failure —
      // this exact class of bug once leaked a fake IPO into production.
      await prisma.gmpObservation.deleteMany({ where: { ipoId: ipo.id } });
      await prisma.gmpSnapshot.deleteMany({ where: { ipoId: ipo.id } });
      await prisma.subscriptionSnapshot.deleteMany({ where: { ipoId: ipo.id } });
      await prisma.ipo.delete({ where: { id: ipo.id } });
    }
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    console.log("cleaned up test data");
    await prisma.$disconnect();
  }
}

main();
