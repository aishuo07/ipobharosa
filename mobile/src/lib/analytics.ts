import Constants from "expo-constants";

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

const posthogExtra = Constants.expoConfig?.extra as PostHogExtra | undefined;
const POSTHOG_KEY = posthogExtra?.posthogProjectToken;
const POSTHOG_HOST = posthogExtra?.posthogHost;

if (__DEV__ && !POSTHOG_KEY) {
  throw new Error(
    "EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}

if (__DEV__ && !POSTHOG_HOST) {
  throw new Error(
    "EXPO_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_HOST is configured",
  );
}

export const analyticsEnabled = Boolean(POSTHOG_KEY && POSTHOG_HOST);

export function analyticsConfig() {
  return {
    apiKey: POSTHOG_KEY,
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: true,
  };
}