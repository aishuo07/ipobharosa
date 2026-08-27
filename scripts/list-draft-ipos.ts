import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

/**
 * Usage: npx tsx scripts/list-draft-ipos.ts
 *
 * Shows every scraped IPO candidate waiting for human review before it
 * can appear on the public board — nothing the discovery pipeline finds
 * goes live without this step.
 */
async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const drafts = await prisma.ipo.findMany({
    where: { publicationState: "DRAFT" },
    include: { company: true },
    orderBy: { discoveredAt: "asc" },
  });

  if (drafts.length === 0) {
    console.log("No pending drafts.");
    await prisma.$disconnect();
    return;
  }

  for (const d of drafts) {
    console.log(`\n=== ${d.company.name} (${d.board}) ===`);
    console.log(`  id: ${d.id}`);
    console.log(`  discovered: ${d.discoveredAt?.toISOString()} from [${d.discoveredFrom.join(", ")}]`);
    console.log(`  price band: ₹${d.priceBandLow}–₹${d.priceBandHigh} · lot size: ${d.lotSize}`);
    console.log(`  issue size: ₹${d.issueSizeCr} Cr (fresh ₹${d.freshIssueCr} Cr / OFS ₹${d.ofsCr} Cr)`);
    console.log(`  dates: open ${d.openDate?.toDateString()} · close ${d.closeDate?.toDateString()} · allotment ${d.allotmentDate?.toDateString()} · refund ${d.refundDate?.toDateString()} · listing ${d.listingDate?.toDateString()}`);
    console.log(`  registrar: ${d.registrar}`);
    console.log(`  lead managers: ${d.leadManagers.join(", ")}`);
  }
  console.log(`\n${drafts.length} draft(s) pending review.`);
  console.log(`Approve: npx tsx scripts/review-draft-ipo.ts "<company name>" approve "<your email>" ["sector"]`);
  console.log(`Reject:  npx tsx scripts/review-draft-ipo.ts "<company name>" reject "<your email>" "<reason>"`);

  await prisma.$disconnect();
}

main();
