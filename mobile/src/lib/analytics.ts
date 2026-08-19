const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

export const analyticsEnabled = Boolean(POSTHOG_KEY && POSTHOG_HOST);

export function analyticsConfig() {
  return {
    apiKey: POSTHOG_KEY,
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: false,
  };
}