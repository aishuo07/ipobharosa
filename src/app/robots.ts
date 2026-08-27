import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

const SITE_URL = resolveSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/watchlist", "/login", "/admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
