import type { MetadataRoute } from "next";
import { getIndexableIpos } from "@/lib/board-data";
import { resolveSiteUrl } from "@/lib/site-url";

const SITE_URL = resolveSiteUrl();

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ipos = await getIndexableIpos();

  const ipoEntries: MetadataRoute.Sitemap = ipos.map((ipo) => ({
    url: `${SITE_URL}/ipo/${ipo.slug}`,
    changeFrequency: "hourly",
    priority: ipo.status === "OPEN" ? 0.9 : 0.6,
  }));

  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/disclaimer`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.2 },
    ...ipoEntries,
  ];
}
