import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
const { prisma } = await import("./src/lib/prisma.ts");
const ipos = await prisma.ipo.findMany({
  where: { publicationState: "PUBLISHED" },
  include: { company: true },
  orderBy: { status: "asc" },
});
console.log(`\n📊 IPOs on Board (${ipos.length} total)\n`);
const byStatus = {};
for (const ipo of ipos) {
  byStatus[ipo.status] = (byStatus[ipo.status] || 0) + 1;
  console.log(`${ipo.company.name.padEnd(40)} | ${ipo.status.padEnd(10)} | ${ipo.board}`);
}
console.log(`\n📈 Status breakdown:`);
for (const [status, count] of Object.entries(byStatus)) {
  console.log(`   ${status}: ${count}`);
}
console.log(`\n📄 Financials status:`);
const withFinancials = await prisma.ipo.findMany({
  where: { publicationState: "PUBLISHED", financialSnapshots: { some: { verified: true } } },
});
console.log(`   Verified: ${withFinancials.length}/${ipos.length}`);
console.log(`   Pending: ${ipos.length - withFinancials.length}/${ipos.length}\n`);
await prisma.$disconnect();
