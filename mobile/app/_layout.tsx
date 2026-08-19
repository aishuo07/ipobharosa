import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Sentry from "@sentry/react-native";
import {
  PostHogErrorBoundary,
  PostHogProvider,
  usePostHog,
} from "posthog-react-native";
import { registerForPushNotifications } from "@/src/lib/notifications";
import { analyticsConfig, analyticsEnabled } from "@/src/lib/analytics";
import { initSentry } from "@/src/lib/sentry";

initSentry();

function AppEvents() {
  const posthog = usePostHog();

  useEffect(() => {
    posthog?.capture("app_open", { screen: "root" });
    registerForPushNotifications();
  }, [posthog]);

  return null;
}

export default function RootLayout() {
  const { apiKey, host, captureAppLifecycleEvents } = analyticsConfig();
  const inner = (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ipo/[slug]" options={{ title: "IPO" }} />
      </Stack>
      <AppEvents />
    </>
  );

  return (
    <Sentry.ErrorBoundary fallback={<></>}>
      {analyticsEnabled ? (
        <PostHogProvider
          apiKey={apiKey}
          options={{
            host,
            captureAppLifecycleEvents,
            errorTracking: {
              autocapture: {
                uncaughtExceptions: true,
                unhandledRejections: true,
                console: [],
              },
            },
          }}
        >
          <PostHogErrorBoundary>{inner}</PostHogErrorBoundary>
        </PostHogProvider>
      ) : (
        inner
      )}
    </Sentry.ErrorBoundary>
  );
}