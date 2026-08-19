import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(SENTRY_DSN);

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.5,
  });
}