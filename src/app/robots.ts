import type { MetadataRoute } from "next";

const SITE_URL = "https://ipobharosa.vercel.app";

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
