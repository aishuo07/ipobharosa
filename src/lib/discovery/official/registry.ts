import { BseOfficialSource } from "./bse";
import { NseOfficialSource } from "./nse";
import type { OfficialIpoSource } from "./types";

const nse = new NseOfficialSource();
const bse = new BseOfficialSource();

export function officialSourceRegistry(): OfficialIpoSource[] {
  return process.env.BSE_OFFICIAL_SOURCE_ENABLED === "true" ? [nse, bse] : [nse];
}
