import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { fetchDocumentsFromIpowatch } = await import("../src/lib/documents/ipowatch");

  const ipos = await prisma.ipo.findMany({
    where: { status: { in: ["UPCOMING", "OPEN", "CLOSED"] } },
    include: { company: true },
  });

  for (const ipo of ipos) {
    let docs;
    try {
      docs = await fetchDocumentsFromIpowatch(ipo.company.name);
    } catch (e) {
      console.log(`SKIP ${ipo.company.name}: ${(e as Error).message}`);
      continue;
    }

    let inserted = 0;
    for (const doc of docs) {
      const exists = await prisma.document.findFirst({ where: { ipoId: ipo.id, url: doc.url } });
      if (exists) continue;
      await prisma.document.create({
        data: { ipoId: ipo.id, label: doc.label, url: doc.url, docType: doc.docType },
      });
      inserted++;
    }
    console.log(`${ipo.company.name}: ${inserted}/${docs.length} documents inserted`);
  }

  await prisma.$disconnect();
}

main();
