import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Sentry from "@sentry/react-native";
import {
  PostHogErrorBoundary,
  PostHogProvider,
  usePostHog,
} from "posthog-react-native";
import { ThemeProvider, useTheme } from "@/src/lib/theme";
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

function ThemedRoot() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ipo/[slug]" options={{ title: "IPO" }} />
      </Stack>
      <AppEvents />
    </>
  );
}

export default function RootLayout() {
  const { apiKey, host, captureAppLifecycleEvents } = analyticsConfig();
  const inner = <ThemedRoot />;

  return (
    <Sentry.ErrorBoundary fallback={<></>}>
      <ThemeProvider>
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
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  );
}