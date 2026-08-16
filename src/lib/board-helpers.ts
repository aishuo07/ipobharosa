import type { BoardIpo } from "./board-data";
import { formatMarketDate, marketDayKey, MARKET_TIME_ZONE } from "./ipo-chronology";

// Real public allotment-status-check portals, keyed by a lowercase
// substring match against the registrar name stored on the IPO —
// registrar names in filings vary slightly in punctuation/suffix
// ("Ltd." vs "Pvt. Ltd.") so substring match is more robust than exact.
const REGISTRAR_ALLOTMENT_URLS: { match: string; url: string }[] = [
  { match: "kfin", url: "https://ipostatus.kfintech.com/" },
  { match: "bigshare", url: "https://ipo.bigshareonline.com/" },
  { match: "mufg", url: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html" },
  { match: "link intime", url: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html" },
];

export function registrarAllotmentUrl(registrar: string | null): string | null {
  if (!registrar) return null;
  const lower = registrar.toLowerCase();
  return REGISTRAR_ALLOTMENT_URLS.find((r) => lower.includes(r.match))?.url ?? null;
}

export function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
export function fmtCr(n: number): string {
  return "₹" + n.toLocaleString("en-IN") + " Cr";
}
export function fmtDate(iso: string): string {
  if (!iso) return "—";
  return formatMarketDate(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  return formatMarketDate(iso, {
    day: "numeric",
    month: "short",
  });
}

export function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MARKET_TIME_ZONE,
  }).format(new Date(iso));
}

export type EffectiveStatus =
  | "open"
  | "closing-soon"
  | "upcoming"
  | "closed"
  | "listed-pending"
  | "listed-gain"
  | "listed-loss";

export function isClosingSoon(ipo: BoardIpo, now: number): boolean {
  if (ipo.status !== "OPEN") return false;
  const diff = new Date(ipo.closeDate).getTime() - now;
  return diff > 0 && diff < 36 * 3600 * 1000;
}

export function effectiveStatus(ipo: BoardIpo, now: number): EffectiveStatus {
  const listingReached = Boolean(ipo.listingDate) && marketDayKey(ipo.listingDate) <= marketDayKey(now);
  if (ipo.status === "LISTED" || listingReached) {
    const gainPct = listingGainPct(ipo);
    if (gainPct === null) return "listed-pending";
    return gainPct >= 0 ? "listed-gain" : "listed-loss";
  }
  if (ipo.status === "OPEN") return isClosingSoon(ipo, now) ? "closing-soon" : "open";
  if (ipo.status === "UPCOMING") return "upcoming";
  return "closed";
}

export function listingGainPct(ipo: BoardIpo): number | null {
  if (ipo.listingPrice === null) return null;
  return ((ipo.listingPrice - ipo.priceBandHigh) / ipo.priceBandHigh) * 100;
}

export function badgeText(status: EffectiveStatus): string {
  return {
    open: "Open",
    "closing-soon": "Closing soon",
    upcoming: "Upcoming",
    closed: "Awaiting allotment",
    "listed-pending": "Listed · Price pending",
    "listed-gain": "Listed · Gain",
    "listed-loss": "Listed · Loss",
  }[status];
}

export function countdownText(ipo: BoardIpo, now: number): string {
  const diff = new Date(ipo.closeDate).getTime() - now;
  if (diff <= 0) return "Closing";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `Closes in ${d}d ${h}h`;
  if (h > 0) return `Closes in ${h}h ${m}m`;
  return `Closes in ${m}m`;
}

export function timeUntil(iso: string, now: number): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "Today";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `in ${d}d ${h}h`;
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export function gmpPct(ipo: BoardIpo): string {
  if (!ipo.gmp) return "0.0";
  return ((ipo.gmp.medianValue / ipo.priceBandHigh) * 100).toFixed(1);
}

// Our own ingestion cycle runs every hour — anything more than double
// that with no successful update is worth flagging explicitly rather
// than making the user do the math on a timestamp themselves.
const STALE_THRESHOLD_MS = 2 * 3600 * 1000;

export function isStale(capturedAtIso: string, now: number): boolean {
  return now - new Date(capturedAtIso).getTime() > STALE_THRESHOLD_MS;
}

export function gmpUpdatedText(capturedAtIso: string, now: number): string {
  const diffMin = Math.max(0, Math.round((now - new Date(capturedAtIso).getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  const rem = diffMin % 60;
  return `${h}h${rem ? " " + rem + "m" : ""} ago`;
}

// Neutral, descriptive language rather than a rating — "confidence:
// HIGH/LOW" reads like a verdict on whether to invest, which risks
// looking like investment advice. This describes what was observed
// (how much the sources agree), not a recommendation.
const CONFIDENCE_LABELS: Record<NonNullable<BoardIpo["gmp"]>["confidence"], string> = {
  HIGH: "Strong source agreement",
  MEDIUM: "Mixed source agreement",
  LOW: "Limited source agreement",
};

export function confidenceLabel(tier: NonNullable<BoardIpo["gmp"]>["confidence"]): string {
  return CONFIDENCE_LABELS[tier];
}

export function subSummary(ipo: BoardIpo): string {
  const s = ipo.subscription;
  if (!s || s.qibX === null || s.niiX === null || s.retailX === null) {
    // Missing data means something different depending on the IPO's
    // actual status — conflating "not open yet" with "not scraped yet"
    // makes an OPEN IPO's card say something factually wrong.
    if (ipo.status === "UPCOMING") return "Bidding not open yet";
    if (ipo.status === "LISTED") return "Final subscription not available";
    return "Subscription data pending";
  }
  if (s.totalX !== null && s.totalX !== undefined) return `${s.retailX.toFixed(1)}x retail · ${s.totalX.toFixed(1)}x overall`;
  const categoryAverage = ((s.qibX + s.niiX + s.retailX + (s.employeeX ?? 0)) / (s.employeeX !== null ? 4 : 3)).toFixed(1);
  return `${s.retailX.toFixed(1)}x retail · ${categoryAverage}x category avg`;
}

export const LIFECYCLE_STEPS: { key: string; label: string; dateKey: keyof BoardIpo }[] = [
  { key: "opens", label: "Opens", dateKey: "openDate" },
  { key: "closes", label: "Closes", dateKey: "closeDate" },
  { key: "allotment", label: "Allotment", dateKey: "allotmentDate" },
  { key: "refund", label: "Refund", dateKey: "refundDate" },
  { key: "listing", label: "Listing", dateKey: "listingDate" },
];

export function lifecycleDoneUpTo(ipo: BoardIpo): number {
  if (ipo.status === "UPCOMING") return -1;
  if (ipo.status === "OPEN") return 0;
  if (ipo.status === "CLOSED") return 1;
  return 4;
}
