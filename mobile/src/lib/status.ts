import type { BoardIpo } from "@/src/lib/types";

export type EffectiveStatus =
  | "open"
  | "closing-soon"
  | "upcoming"
  | "closed"
  | "listed-pending"
  | "listed-gain"
  | "listed-loss";

export type StatusSection = "OPEN" | "UPCOMING" | "CLOSED" | "LISTED";

function marketDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + 5.5 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function isClosingSoon(ipo: BoardIpo, now: number): boolean {
  if (!ipo.closeDate) return false;
  const diff = new Date(ipo.closeDate).getTime() - now;
  return diff > 0 && diff < 36 * 3600 * 1000;
}

export function listingGainPct(ipo: BoardIpo): number | null {
  if (ipo.listingPrice === null) return null;
  return ((ipo.listingPrice - ipo.priceBandHigh) / ipo.priceBandHigh) * 100;
}

export function effectiveStatus(ipo: BoardIpo, now: number): EffectiveStatus {
  const listingReached = Boolean(ipo.listingDate) && marketDayKey(ipo.listingDate) <= marketDayKey(new Date(now).toISOString());
  if (ipo.status === "LISTED" || listingReached) {
    const gainPct = listingGainPct(ipo);
    if (gainPct === null) return "listed-pending";
    return gainPct >= 0 ? "listed-gain" : "listed-loss";
  }
  if (ipo.status === "OPEN") return isClosingSoon(ipo, now) ? "closing-soon" : "open";
  if (ipo.status === "UPCOMING") return "upcoming";
  if (ipo.status === "CLOSED") {
    const closeEnded = Boolean(ipo.closeDate) && marketDayKey(ipo.closeDate) < marketDayKey(new Date(now).toISOString());
    if (!closeEnded) return isClosingSoon(ipo, now) ? "closing-soon" : "open";
  }
  return "closed";
}

export const STATUS_LABELS: Record<EffectiveStatus, string> = {
  open: "Open",
  "closing-soon": "Closing soon",
  upcoming: "Upcoming",
  closed: "Awaiting allotment",
  "listed-pending": "Listed · Price pending",
  "listed-gain": "Listed · Gain",
  "listed-loss": "Listed · Loss",
};

export function effectiveSection(ipo: BoardIpo, now: number): StatusSection {
  const es = effectiveStatus(ipo, now);
  if (es === "upcoming") return "UPCOMING";
  if (es === "open" || es === "closing-soon") return "OPEN";
  if (es.startsWith("listed")) return "LISTED";
  return "CLOSED";
}