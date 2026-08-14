import { describe, expect, it } from "vitest";
import { getEmailReadiness } from "./readiness";

describe("user email readiness", () => {
  it("stays disabled until the explicit feature flag is enabled", () => {
    expect(getEmailReadiness({
      RESEND_API_KEY: "secret",
      AUTH_EMAIL_FROM: "IPOBharosa <hello@mail.ipobharosa.com>",
      SITE_URL: "https://ipobharosa.com",
    })).toMatchObject({ enabled: false, transportReady: true, featureFlagEnabled: false });
  });

  it("reports missing pieces without returning secret values", () => {
    const result = getEmailReadiness({ EMAIL_USER_FEATURES_ENABLED: "true" });
    expect(result.enabled).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "RESEND_API_KEY is missing",
      "AUTH_EMAIL_FROM is missing",
      "SITE_URL or NEXT_PUBLIC_SITE_URL is missing",
    ]));
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("enables sign-in and reminders only when every launch requirement is present", () => {
    expect(getEmailReadiness({
      EMAIL_USER_FEATURES_ENABLED: "true",
      RESEND_API_KEY: "secret",
      AUTH_EMAIL_FROM: "IPOBharosa <hello@mail.ipobharosa.com>",
      NEXT_PUBLIC_SITE_URL: "https://ipobharosa.com",
    })).toMatchObject({ enabled: true, transportReady: true, siteUrl: "https://ipobharosa.com" });
  });
});
