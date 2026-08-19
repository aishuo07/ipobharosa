import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getApiUrl } from "@/src/lib/api";

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function getDeviceToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (error) {
    console.warn("Failed to get Expo push token", error);
    return null;
  }
}

async function requestPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.warn("Failed to request notification permission", error);
    return false;
  }
}

export async function registerForPushNotifications(): Promise<void> {
  configureNotifications();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "IPO Alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const granted = await requestPermission();
  if (!granted) return;

  const token = await getDeviceToken();
  if (!token) return;

  try {
    const response = await fetch(`${getApiUrl()}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });
    if (!response.ok) {
      console.warn(`Push registration failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn("Push registration request failed", error);
  }
}