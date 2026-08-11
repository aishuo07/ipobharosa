import type { MetadataRoute } from "next";
import { getBoardIpos } from "@/lib/board-data";

const SITE_URL = "https://ipobharosa.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ipos = await getBoardIpos();

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
