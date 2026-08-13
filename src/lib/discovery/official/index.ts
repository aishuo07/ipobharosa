import { NseOfficialSource } from "./nse";
import type { OfficialEvidenceResult } from "./types";

const nse = new NseOfficialSource();

export async function fetchOfficialIpoEvidence(companyName: string): Promise<OfficialEvidenceResult> {
  return nse.findEvidence(companyName);
}

export * from "./types";

