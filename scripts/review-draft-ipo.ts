import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

/**
 * Usage:
 *   npx tsx scripts/review-draft-ipo.ts "<company name>" approve "<your email>" "<sector>"
 *   npx tsx scripts/review-draft-ipo.ts "<company name>" reject "<your email>" "<reason>"
 *
 * Approving requires a sector because the discovery pipeline deliberately
 * doesn't try to auto-classify it — reliable classification needs a human
 * reading the company's actual business, not a regex over marketing copy.
 * Run scripts/list-draft-ipos.ts first to see what's pending and its facts.
 */
async function main() {
  const [companyNameQuery, action, reviewedBy, extra] = process.argv.slice(2);
  if (!companyNameQuery || !action || !reviewedBy || !extra || !["approve", "reject"].includes(action)) {
    console.error(
      'Usage: npx tsx scripts/review-draft-ipo.ts "<company name>" approve "<your email>" "<sector>"\n' +
      '   or: npx tsx scripts/review-draft-ipo.ts "<company name>" reject "<your email>" "<reason>"',
    );
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");

  const matches = await prisma.ipo.findMany({
    where: { publicationState: "DRAFT", company: { name: { contains: companyNameQuery, mode: "insensitive" } } },
    include: { company: true },
  });

  if (matches.length === 0) {
    console.error(`No draft IPO matches "${companyNameQuery}". Run scripts/list-draft-ipos.ts to see what's pending.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${companyNameQuery}" matches ${matches.length} drafts — be more specific:`);
    matches.forEach((m) => console.error(`  - ${m.company.name}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  const draft = matches[0];

  if (action === "approve") {
    await prisma.$transaction([
      prisma.ipo.update({
        where: { id: draft.id },
        data: { publicationState: "PUBLISHED", reviewedBy, reviewedAt: new Date() },
      }),
      prisma.company.update({ where: { id: draft.companyId }, data: { sector: extra } }),
      prisma.correctionLog.create({
        data: {
          entityType: "Ipo",
          entityId: draft.id,
          action: "publish",
          performedBy: reviewedBy,
          note: `sector: ${extra}`,
        },
      }),
    ]);
    console.log(`Published ${draft.company.name} (sector: ${extra}) — now live on the board.`);
  } else {
    await prisma.$transaction([
      prisma.ipo.update({
        where: { id: draft.id },
        data: { publicationState: "REJECTED", reviewedBy, reviewedAt: new Date() },
      }),
      prisma.correctionLog.create({
        data: {
          entityType: "Ipo",
          entityId: draft.id,
          action: "reject",
          performedBy: reviewedBy,
          note: extra,
        },
      }),
    ]);
    console.log(`Rejected ${draft.company.name}: ${extra}`);
  }

  await prisma.$disconnect();
}

main();
