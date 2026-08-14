const FALLBACK_SITE_URL = "https://ipobharosa.vercel.app";

export type SiteUrlEnvironment = {
  SITE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

const PROCESS_SITE_URL_ENV: SiteUrlEnvironment = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SITE_URL: process.env.SITE_URL,
};

function normalizeSiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid IPOBharosa site URL: ${value}`);
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("IPOBharosa site URL must use HTTPS outside localhost");
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("IPOBharosa site URL must be an origin without credentials, path, query or fragment");
  }
  return url.origin;
}

/** One canonical origin for SEO, calendar, email, alerts and bot identity. */
export function resolveSiteUrl(env: SiteUrlEnvironment = PROCESS_SITE_URL_ENV): string {
  const publicValue = env.NEXT_PUBLIC_SITE_URL?.trim();
  const serverValue = env.SITE_URL?.trim();
  const publicUrl = publicValue ? normalizeSiteUrl(publicValue) : null;
  const serverUrl = serverValue ? normalizeSiteUrl(serverValue) : null;
  if (publicUrl && serverUrl && publicUrl !== serverUrl) {
    throw new Error("SITE_URL and NEXT_PUBLIC_SITE_URL must resolve to the same origin");
  }
  return publicUrl ?? serverUrl ?? FALLBACK_SITE_URL;
}

export function siteUrlConfigured(env: SiteUrlEnvironment = PROCESS_SITE_URL_ENV): boolean {
  return Boolean(env.NEXT_PUBLIC_SITE_URL?.trim() || env.SITE_URL?.trim());
}

export function ipobharosaUserAgent(product = "IPOBharosaBot/1.0", env: SiteUrlEnvironment = PROCESS_SITE_URL_ENV): string {
  return `Mozilla/5.0 (compatible; ${product}; +${resolveSiteUrl(env)})`;
}
