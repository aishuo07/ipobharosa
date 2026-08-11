import { toIpoSlug } from "@/lib/ipo-slug";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";

export type GmpHistoryPoint = { value: number; capturedAt: Date };

/**
 * ipoji.com embeds each IPO's full GMP history as a JSON script tag
 * (used to drive their own trend chart) — a real, useful backfill
 * source for a chart we'd otherwise have to wait weeks of our own
 * ingestion cycles to build up.
 */
export async function fetchGmpHistoryFromIpoji(companyName: string): Promise<GmpHistoryPoint[]> {
  const slug = toIpoSlug(companyName);
  const url = `https://www.ipoji.com/ipo/${slug}-ipo`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`ipoji history: HTTP ${res.status} for ${url}`);
  const html = await res.text();

  const match = html.match(
    /<script type="application\/json" id="ipo-gmp-graph-data">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error(`ipoji history: no gmp-graph-data found for "${companyName}" at ${url}`);
  }

  const raw: { value: number; dateTime: string }[] = JSON.parse(match[1]);
  return raw.map((p) => ({ value: p.value, capturedAt: new Date(p.dateTime) }));
}
