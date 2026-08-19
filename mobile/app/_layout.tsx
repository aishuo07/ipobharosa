import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerForPushNotifications } from "@/src/lib/notifications";

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ipo/[slug]" options={{ title: "IPO" }} />
      </Stack>
    </>
  );
}