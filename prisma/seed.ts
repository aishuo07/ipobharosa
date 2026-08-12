/**
 * Seeds real, currently active Indian IPOs (researched 2026-08-11) — not
 * fictional companies. GMP/subscription figures below are single
 * manually-researched data points, seeded as LOW/MEDIUM confidence
 * snapshots; the real multi-source scraper pipeline (src/lib/gmp) takes
 * over from here on every cron run.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeGmpSnapshot } from "../src/lib/gmp/confidence";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type SeedIpo = {
  companyName: string;
  sector: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  board: "MAINBOARD" | "SME";
  priceBandLow: number;
  priceBandHigh: number;
  lotSize: number;
  issueSizeCr: number;
  freshIssueCr?: number;
  ofsCr?: number;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  refundDate: string;
  listingDate: string;
  registrar: string;
  leadManagers: string[];
  gmpObservations?: number[]; // one or more real, independently-sourced GMP figures
  subscription?: { qibX?: number; niiX?: number; retailX?: number; employeeX?: number };
};

const IPOS: SeedIpo[] = [
  {
    companyName: "Technocraft Ventures Ltd",
    sector: "Diversified Manufacturing",
    status: "CLOSED",
    board: "MAINBOARD",
    priceBandLow: 200,
    priceBandHigh: 212,
    lotSize: 70,
    issueSizeCr: 251.88,
    freshIssueCr: 201.51,
    ofsCr: 50.37,
    openDate: "2026-08-07",
    closeDate: "2026-08-11",
    allotmentDate: "2026-08-12",
    refundDate: "2026-08-13",
    listingDate: "2026-08-14",
    registrar: "Bigshare Services Pvt. Ltd.",
    leadManagers: ["Khambatta Securities Ltd"],
    gmpObservations: [27],
  },
  {
    companyName: "LEAP India Pvt Ltd",
    sector: "Supply-Chain & Asset Pooling",
    status: "CLOSED",
    board: "MAINBOARD",
    priceBandLow: 151,
    priceBandHigh: 159,
    lotSize: 94,
    issueSizeCr: 2480,
    openDate: "2026-08-07",
    closeDate: "2026-08-11",
    allotmentDate: "2026-08-12",
    refundDate: "2026-08-13",
    listingDate: "2026-08-14",
    registrar: "MUFG Intime India Pvt. Ltd.",
    leadManagers: ["JM Financial", "Avendus Capital", "IIFL Capital Services", "UBS Securities"],
    gmpObservations: [11],
  },
  {
    companyName: "Dhoot Transmission Ltd",
    sector: "Auto Components",
    status: "OPEN",
    board: "MAINBOARD",
    priceBandLow: 829,
    priceBandHigh: 871,
    lotSize: 17,
    issueSizeCr: 3066.89,
    openDate: "2026-08-10",
    closeDate: "2026-08-12",
    allotmentDate: "2026-08-13",
    refundDate: "2026-08-13",
    listingDate: "2026-08-17",
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["Axis Capital Ltd"],
    // Two independently published figures for the same day — real
    // multi-source disagreement, not a fabricated example.
    gmpObservations: [243, 235],
    subscription: { qibX: 0.06, niiX: 1.02, retailX: 0.76 },
  },
  {
    companyName: "Molbio Diagnostics Ltd",
    sector: "Diagnostics & Healthcare",
    status: "OPEN",
    board: "MAINBOARD",
    priceBandLow: 768,
    priceBandHigh: 807,
    lotSize: 18,
    issueSizeCr: 940,
    openDate: "2026-08-10",
    closeDate: "2026-08-12",
    allotmentDate: "2026-08-13",
    refundDate: "2026-08-13",
    listingDate: "2026-08-17",
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["Kotak Mahindra Capital Co. Ltd"],
    gmpObservations: [132],
  },
  {
    companyName: "Milky Mist Dairy Food Ltd",
    sector: "FMCG / Dairy",
    status: "OPEN",
    board: "MAINBOARD",
    priceBandLow: 133,
    priceBandHigh: 140,
    lotSize: 107,
    issueSizeCr: 1553,
    openDate: "2026-08-11",
    closeDate: "2026-08-13",
    allotmentDate: "2026-08-14",
    refundDate: "2026-08-14",
    listingDate: "2026-08-18",
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["JM Financial Ltd"],
    // No confirmed GMP figure found at seed time — left unset rather than guessed.
  },
  {
    companyName: "Shiprocket Ltd",
    sector: "E-commerce Logistics Tech",
    status: "UPCOMING",
    board: "MAINBOARD",
    priceBandLow: 92,
    priceBandHigh: 97,
    lotSize: 154,
    issueSizeCr: 1618,
    openDate: "2026-08-12",
    closeDate: "2026-08-14",
    allotmentDate: "2026-08-17",
    refundDate: "2026-08-17",
    listingDate: "2026-08-19",
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["Axis Capital Ltd"],
    gmpObservations: [26],
  },
];

async function main() {
  const seedSourceA = await prisma.gmpSource.upsert({
    where: { adapterKey: "seed-source-a" },
    update: {},
    create: {
      name: "Manually researched (seed) — source A",
      baseUrl: "n/a",
      adapterKey: "seed-source-a",
      active: false,
    },
  });
  const seedSourceB = await prisma.gmpSource.upsert({
    where: { adapterKey: "seed-source-b" },
    update: {},
    create: {
      name: "Manually researched (seed) — source B",
      baseUrl: "n/a",
      adapterKey: "seed-source-b",
      active: false,
    },
  });
  const seedSources = [seedSourceA, seedSourceB];

  for (const item of IPOS) {
    const existingCompany = await prisma.company.findFirst({
      where: { name: item.companyName },
    });
    const company =
      existingCompany ??
      (await prisma.company.create({
        data: { name: item.companyName, sector: item.sector },
      }));

    const existingIpo = await prisma.ipo.findFirst({ where: { companyId: company.id } });
    const ipo = existingIpo
      ? await prisma.ipo.update({
          where: { id: existingIpo.id },
          data: {
            status: item.status,
            publicationState: "PUBLISHED",
            board: item.board,
            priceBandLow: item.priceBandLow,
            priceBandHigh: item.priceBandHigh,
            lotSize: item.lotSize,
            issueSizeCr: item.issueSizeCr,
            freshIssueCr: item.freshIssueCr,
            ofsCr: item.ofsCr,
            openDate: new Date(item.openDate),
            closeDate: new Date(item.closeDate),
            allotmentDate: new Date(item.allotmentDate),
            refundDate: new Date(item.refundDate),
            listingDate: new Date(item.listingDate),
            registrar: item.registrar,
            leadManagers: item.leadManagers,
          },
        })
      : await prisma.ipo.create({
          data: {
            companyId: company.id,
            status: item.status,
            publicationState: "PUBLISHED",
            board: item.board,
            priceBandLow: item.priceBandLow,
            priceBandHigh: item.priceBandHigh,
            lotSize: item.lotSize,
            issueSizeCr: item.issueSizeCr,
            freshIssueCr: item.freshIssueCr,
            ofsCr: item.ofsCr,
            openDate: new Date(item.openDate),
            closeDate: new Date(item.closeDate),
            allotmentDate: new Date(item.allotmentDate),
            refundDate: new Date(item.refundDate),
            listingDate: new Date(item.listingDate),
            registrar: item.registrar,
            leadManagers: item.leadManagers,
          },
        });

    const hasGmp = await prisma.gmpSnapshot.count({ where: { ipoId: ipo.id } });
    if (item.gmpObservations?.length && hasGmp === 0) {
      const observationRows = item.gmpObservations.map((value, i) => ({
        ipoId: ipo.id,
        sourceId: seedSources[i % seedSources.length].id,
        value,
        success: true,
      }));
      await prisma.gmpObservation.createMany({ data: observationRows });

      const snapshot = computeGmpSnapshot(item.gmpObservations);
      if (snapshot) {
        await prisma.gmpSnapshot.create({
          data: {
            ipoId: ipo.id,
            medianValue: snapshot.medianValue,
            sourceCount: snapshot.sourceCount,
            maxDeviation: snapshot.maxDeviation,
            confidence: snapshot.confidence,
          },
        });
      }
    }

    const hasSubscription = await prisma.subscriptionSnapshot.count({ where: { ipoId: ipo.id } });
    if (item.subscription && hasSubscription === 0) {
      await prisma.subscriptionSnapshot.create({
        data: {
          ipoId: ipo.id,
          qibX: item.subscription.qibX,
          niiX: item.subscription.niiX,
          retailX: item.subscription.retailX,
          employeeX: item.subscription.employeeX,
          sourceExchange: "nse",
        },
      });
    }

    console.log(`Seeded ${item.companyName} (${item.status})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
