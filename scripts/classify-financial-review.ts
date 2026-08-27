import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.IPOBHAROSA_ENV_FILE ?? ".env.local" });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { applyPendingFinancialClassification, previewPendingFinancialClassification } = await import("../src/lib/financials/workflow");
  const rows = await previewPendingFinancialClassification();
  if (apply) await applyPendingFinancialClassification("financial-classification-script");

  const byState = Object.fromEntries(["AUTO_VERIFIED", "REVIEW_REQUIRED"].map((state) => [state, rows.filter((row) => row.state === state).length]));
  const byReason = Object.fromEntries(
    [...new Set(rows.flatMap((row) => row.reasons))].sort().map((reason) => [reason, rows.filter((row) => row.reasons.includes(reason)).length]),
  );
  const safeBatches = new Set(rows.filter((row) => row.state === "AUTO_VERIFIED").map((row) => row.documentId)).size;
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "NO_WRITE", total: rows.length, safeBatches, byState, byReason, rows }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
