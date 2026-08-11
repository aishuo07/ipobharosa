import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { fetchFinancialsFromSahi } = await import("../src/lib/financials/sahi");

  const ipos = await prisma.ipo.findMany({
    where: { status: { in: ["UPCOMING", "OPEN", "CLOSED"] } },
    include: { company: true },
  });

  for (const ipo of ipos) {
    let years;
    try {
      years = await fetchFinancialsFromSahi(ipo.company.name);
    } catch (e) {
      console.log(`SKIP ${ipo.company.name}: ${(e as Error).message}`);
      continue;
    }

    let inserted = 0;
    for (const y of years) {
      const exists = await prisma.financialSnapshot.findFirst({
        where: { ipoId: ipo.id, fiscalYear: y.fiscalYear },
      });
      if (exists) continue;
      await prisma.financialSnapshot.create({
        data: {
          ipoId: ipo.id,
          fiscalYear: y.fiscalYear,
          revenueCr: y.revenueCr,
          patCr: y.patCr,
          peRatio: y.peRatio,
          ronwPct: y.ronwPct,
          debtEquity: y.debtEquity,
          eps: y.eps,
          enteredBy: "scraper:sahi.com (reviewed pipeline pending)",
        },
      });
      inserted++;
    }
    console.log(`${ipo.company.name}: ${inserted}/${years.length} financial years inserted`);
  }

  await prisma.$disconnect();
}

main();
