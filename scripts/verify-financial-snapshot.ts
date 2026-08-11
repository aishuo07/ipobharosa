import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

/**
 * Minimal human-in-the-loop verification tool — deliberately a CLI
 * script, not a full web admin panel, to keep the architecture simple
 * until there's real evidence a web UI is needed.
 *
 * Usage:
 *   npx tsx scripts/verify-financial-snapshot.ts "Dhoot Transmission Ltd" "31 Mar 2026" "you@example.com" "Checked against RHP page 142"
 */
async function main() {
  const [companyName, fiscalYear, verifiedBy, note] = process.argv.slice(2);
  if (!companyName || !fiscalYear || !verifiedBy) {
    console.error(
      'Usage: npx tsx scripts/verify-financial-snapshot.ts "<Company Name>" "<Fiscal Year>" "<your email>" ["note"]',
    );
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");

  const company = await prisma.company.findFirst({ where: { name: companyName } });
  if (!company) {
    console.error(`No company found matching "${companyName}"`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const snapshot = await prisma.financialSnapshot.findFirst({
    where: { ipo: { companyId: company.id }, fiscalYear },
  });
  if (!snapshot) {
    console.error(`No financial snapshot found for "${companyName}" / "${fiscalYear}"`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.financialSnapshot.update({
    where: { id: snapshot.id },
    data: { verified: true, verifiedBy, verifiedAt: new Date() },
  });

  await prisma.correctionLog.create({
    data: {
      entityType: "FinancialSnapshot",
      entityId: snapshot.id,
      action: "verify",
      performedBy: verifiedBy,
      note: note ?? null,
    },
  });

  console.log(`Verified ${companyName} — ${fiscalYear} (by ${verifiedBy})`);
  await prisma.$disconnect();
}

main();
