import { Platform } from "react-native";

/**
 * IPOBharosa Design System v2 tokens (mobile port).
 * Mirrors ~/Downloads/IPOBharosa-Design-System-v2.html so the mobile app and
 * web share the same palette, typography scale and semantic colors.
 */
export const colors = {
  paper: "#F7F8F4",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2EC",
  ink: "#173C32",
  inkMuted: "#5A6B63",
  inkFaint: "#8A968F",
  saffron: "#E76F35",
  saffronSoft: "#FDF0E8",
  green: "#237355",
  greenSoft: "#E8F2ED",
  amber: "#9A4E22",
  amberSoft: "#F6EBE3",
  blue: "#3B5BA5",
  blueSoft: "#EAEEF7",
  red: "#A13F35",
  redSoft: "#F6EAE8",
  border: "#DEE1D9",
  white: "#FFFFFF",
} as const;

export type ColorName = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Newsreader" }),
    fontWeight: "700",
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "DM Sans" }),
    fontWeight: "800",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "DM Sans" }),
    fontWeight: "400",
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "DM Sans" }),
    fontWeight: "500",
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "DM Sans" }),
    fontWeight: "700",
    letterSpacing: 0.4,
  },
} as const;

/** Semantic status color; used by IPO status chips and allotment rows. */
export function statusColor(status: string): ColorName {
  switch (status) {
    case "ALLOTTED":
    case "LISTED":
    case "OPEN":
      return "green";
    case "NOT_ALLOTTED":
    case "CLOSED":
    case "ERROR":
      return "red";
    case "UPCOMING":
      return "blue";
    case "NOT_APPLIED":
    case "closing-soon":
      return "amber";
    default:
      return "inkMuted";
  }
}

export function statusSoftColor(status: string): ColorName {
  switch (status) {
    case "ALLOTTED":
    case "LISTED":
    case "OPEN":
      return "greenSoft";
    case "NOT_ALLOTTED":
    case "CLOSED":
    case "ERROR":
      return "redSoft";
    case "UPCOMING":
      return "blueSoft";
    case "NOT_APPLIED":
    case "closing-soon":
      return "amberSoft";
    default:
      return "surfaceAlt";
  }
}
