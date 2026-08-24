import { useEffect } from "react";
import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { usePostHog } from "posthog-react-native";
import { useThemeColors, spacing } from "@/src/lib/theme";

function BrandHeader() {
  const colors = useThemeColors();
  return (
    <View style={[styles.brandRow]}>
      <View style={[styles.brandMark]}>
        <Ionicons name="trending-up" size={18} color={colors.white} />
      </View>
      <View>
        <Text style={[styles.brandWordmark, { color: colors.ink }]}>IPOBharosa</Text>
        <Text style={[styles.brandEyebrow, { color: colors.inkFaint }]}>LOT SIZE · GMP · DATES · ALLOTMENT</Text>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const pathname = usePathname();
  const posthog = usePostHog();
  const colors = useThemeColors();
  useEffect(() => {
    posthog?.capture("screen_view", { screen: pathname });
  }, [pathname, posthog]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.inkMuted,
        headerShown: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        headerStyle: { backgroundColor: colors.paper, shadowOpacity: 0, elevation: 0 },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink },
        headerTitle: () => <BrandHeader />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "IPO Board",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pan-cards"
        options={{
          title: "PAN Cards",
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="investors"
        options={{
          title: "Investors",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="allotment"
        options={{
          title: "Allotment",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#237355",
  },
  brandWordmark: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  brandEyebrow: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
  },
});