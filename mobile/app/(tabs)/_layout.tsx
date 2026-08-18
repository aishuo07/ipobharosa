import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0E6B3A",
        tabBarInactiveTintColor: "#6B7280",
        headerShown: true,
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
        name="allotment"
        options={{
          title: "Allotment",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}