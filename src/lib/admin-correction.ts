import type { Prisma } from "@/generated/prisma/client";
import { filingEvidenceClass } from "@/lib/document-evidence";

type ComparisonInput = { field: string; officialValue: string | null };

function decoded(value: string | null): unknown {
  if (value === null) throw new Error("Official value is missing");
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numberValue(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid official ${field}`);
  return parsed;
}

function textValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid official ${field}`);
  return value.trim();
}

export function officialCorrectionData(comparisons: ComparisonInput[]): {
  data: Prisma.IpoUncheckedUpdateInput;
  companyName?: string;
  fields: string[];
} {
  const data: Prisma.IpoUncheckedUpdateInput = {};
  let companyName: string | undefined;
  const fields: string[] = [];
  for (const comparison of comparisons) {
    const value = decoded(comparison.officialValue);
    if (comparison.field === "companyName") {
      companyName = textValue(value, comparison.field);
    } else if (comparison.field === "board") {
      if (value !== "MAINBOARD" && value !== "SME") throw new Error("Invalid official board");
      data.board = value;
    } else if (comparison.field === "priceBandLow" || comparison.field === "priceBandHigh") {
      data[comparison.field] = numberValue(value, comparison.field);
    } else if (comparison.field === "lotSize") {
      const lotSize = numberValue(value, comparison.field);
      if (!Number.isInteger(lotSize)) throw new Error("Invalid official lotSize");
      data.lotSize = lotSize;
    } else if (comparison.field === "openDate" || comparison.field === "closeDate") {
      const dateText = textValue(value, comparison.field);
      const date = new Date(`${dateText}T00:00:00+05:30`);
      if (Number.isNaN(date.getTime())) throw new Error(`Invalid official ${comparison.field}`);
      data[comparison.field] = date;
    } else if (comparison.field === "registrar") {
      data.registrar = textValue(value, comparison.field);
    } else if (comparison.field === "leadManagers") {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
        throw new Error("Invalid official leadManagers");
      }
      data.leadManagers = value.map((entry) => String(entry).trim());
    } else if (comparison.field === "rhpUrl") {
      const url = textValue(value, comparison.field);
      if (filingEvidenceClass(url) !== "OFFICIAL") throw new Error("Correction requires an official filing URL");
      data.rhpUrl = url;
    } else {
      throw new Error(`${comparison.field} is not correction-enabled`);
    }
    fields.push(comparison.field);
  }
  if (fields.length === 0) throw new Error("No official corrections were selected");
  return { data, companyName, fields };
}
