import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { fetchGmpHistoryFromIpoji } = await import("../src/lib/gmp/history");
  const { computeGmpSnapshot } = await import("../src/lib/gmp/confidence");

  const ipos = await prisma.ipo.findMany({
    where: { status: { in: ["UPCOMING", "OPEN", "CLOSED"] } },
    include: { company: true },
  });

  for (const ipo of ipos) {
    let history;
    try {
      history = await fetchGmpHistoryFromIpoji(ipo.company.name);
    } catch (e) {
      console.log(`SKIP ${ipo.company.name}: ${(e as Error).message}`);
      continue;
    }

    let inserted = 0;
    for (const point of history) {
      const exists = await prisma.gmpSnapshot.findFirst({
        where: { ipoId: ipo.id, capturedAt: point.capturedAt },
      });
      if (exists) continue;

      const snapshot = computeGmpSnapshot([point.value]);
      if (!snapshot) continue;

      await prisma.gmpSnapshot.create({
        data: {
          ipoId: ipo.id,
          medianValue: snapshot.medianValue,
          sourceCount: snapshot.sourceCount,
          maxDeviation: snapshot.maxDeviation,
          confidence: snapshot.confidence,
          capturedAt: point.capturedAt,
        },
      });
      inserted++;
    }
    console.log(`${ipo.company.name}: ${inserted}/${history.length} historical points inserted`);
  }

  await prisma.$disconnect();
}

main();
