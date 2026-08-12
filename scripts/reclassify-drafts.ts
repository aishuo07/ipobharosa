import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

/**
 * Usage:
 *   npx tsx scripts/reclassify-drafts.ts            (dry run — prints a report only)
 *   npx tsx scripts/reclassify-drafts.ts --apply     (actually auto-publish the HIGH-confidence ones)
 *
 * These drafts were created before the discovery pipeline had
 * confidence-tier auto-publish logic, so they were never checked for an
 * official DRHP/RHP link. This re-fetches each one, re-classifies it
 * with the same rules new candidates go through, and only ever
 * auto-publishes what would already qualify today — nothing here lowers
 * the bar for what "safe to auto-publish" means.
 */
async function main() {
  const apply = process.argv.includes("--apply");

  const { prisma } = await import("../src/lib/prisma");
  const { toIpoSlug } = await import("../src/lib/ipo-slug");
  const { fetchIpoFacts } = await import("../src/lib/discovery/ipowatch-facts");
  const { validateIpoFacts } = await import("../src/lib/discovery/validate");
  const { classifyCandidate } = await import("../src/lib/discovery/classify");

  const drafts = await prisma.ipo.findMany({
    where: { publicationState: "DRAFT" },
    include: { company: true },
  });

  console.log(`Reclassifying ${drafts.length} existing draft(s)${apply ? " (APPLYING changes)" : " (dry run)"}\n`);

  let autoPublishCount = 0;
  let keptAsDraftCount = 0;
  let errorCount = 0;

  for (const draft of drafts) {
    // Legacy drafts created before sourceUrl was stored have to guess the
    // URL from the company name — that guess fails on multi-word/
    // punctuated names, which is exactly why sourceUrl now gets saved.
    const detailUrl = draft.sourceUrl ?? `https://ipowatch.in/${toIpoSlug(draft.company.name)}-ipo/`;

    try {
      const facts = await fetchIpoFacts(detailUrl, draft.company.name, draft.board);
      const problems = validateIpoFacts(facts);
      const crossVerified = draft.discoveredFrom.includes("sahi");
      const hasOfficialDocument = Boolean(facts.drhpUrl || facts.rhpUrl);
      const confidence = classifyCandidate({ validationProblems: problems, crossVerified, hasOfficialDocument });

      const decision = confidence === "HIGH" ? "AUTO-PUBLISH" : "KEEP AS DRAFT";
      console.log(
        `${draft.company.name}: crossVerified=${crossVerified} hasDoc=${hasOfficialDocument} problems=${problems.length} -> ${decision}`,
      );

      if (confidence === "HIGH") {
        autoPublishCount++;
        if (apply) {
          await prisma.$transaction([
            prisma.ipo.update({
              where: { id: draft.id },
              data: {
                publicationState: "PUBLISHED",
                autoPublished: true,
                reviewedAt: new Date(),
                drhpUrl: facts.drhpUrl,
                rhpUrl: facts.rhpUrl,
              },
            }),
            prisma.correctionLog.create({
              data: {
                entityType: "Ipo",
                entityId: draft.id,
                action: "auto-publish",
                performedBy: "discovery-pipeline",
                note: "reclassified against confidence-tier rules added after this draft was created",
              },
            }),
          ]);
        }
      } else {
        keptAsDraftCount++;
        if (apply) {
          // Backfill the doc links either way — useful context for whoever
          // reviews this one manually, even though it doesn't change the state.
          await prisma.ipo.update({
            where: { id: draft.id },
            data: { drhpUrl: facts.drhpUrl, rhpUrl: facts.rhpUrl },
          });
        }
      }
    } catch (e) {
      errorCount++;
      console.log(`${draft.company.name}: ERROR re-fetching — ${(e as Error).message}`);
    }
  }

  console.log(
    `\n${autoPublishCount} would auto-publish, ${keptAsDraftCount} stay as drafts, ${errorCount} errored.`,
  );
  if (!apply) console.log("Dry run only — re-run with --apply to actually make these changes.");

  await prisma.$disconnect();
}

main();
