import { resolveSiteUrl, siteUrlConfigured, type SiteUrlEnvironment } from "@/lib/site-url";

export type EmailEnvironment = SiteUrlEnvironment & {
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  EMAIL_USER_FEATURES_ENABLED?: string;
};

export type EmailReadiness = {
  enabled: boolean;
  transportReady: boolean;
  apiKeyConfigured: boolean;
  senderConfigured: boolean;
  siteUrlConfigured: boolean;
  featureFlagEnabled: boolean;
  from: string | null;
  siteUrl: string;
  reasons: string[];
};

const PROCESS_EMAIL_ENV: EmailEnvironment = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SITE_URL: process.env.SITE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
  EMAIL_USER_FEATURES_ENABLED: process.env.EMAIL_USER_FEATURES_ENABLED,
};

/** Reports only configuration presence; it never exposes credentials. */
export function getEmailReadiness(env: EmailEnvironment = PROCESS_EMAIL_ENV): EmailReadiness {
  const apiKeyConfigured = Boolean(env.RESEND_API_KEY?.trim());
  const from = env.AUTH_EMAIL_FROM?.trim() || null;
  const senderConfigured = Boolean(from);
  const hasSiteUrl = siteUrlConfigured(env);
  const featureFlagEnabled = env.EMAIL_USER_FEATURES_ENABLED === "true";
  const transportReady = apiKeyConfigured && senderConfigured;
  const reasons = [
    !featureFlagEnabled ? "EMAIL_USER_FEATURES_ENABLED is not true" : null,
    !apiKeyConfigured ? "RESEND_API_KEY is missing" : null,
    !senderConfigured ? "AUTH_EMAIL_FROM is missing" : null,
    !hasSiteUrl ? "SITE_URL or NEXT_PUBLIC_SITE_URL is missing" : null,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    enabled: featureFlagEnabled && transportReady && hasSiteUrl,
    transportReady,
    apiKeyConfigured,
    senderConfigured,
    siteUrlConfigured: hasSiteUrl,
    featureFlagEnabled,
    from,
    siteUrl: resolveSiteUrl(env),
    reasons,
  };
}
