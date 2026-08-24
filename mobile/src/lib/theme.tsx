import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "light" | "dark" | "system";

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  isDark: false,
  setMode: () => {},
});

const STORAGE_KEY = "ipobharosa.theme.v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    void AsyncStorage.setItem(STORAGE_KEY, newMode);
  };

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors() {
  const { isDark } = useTheme();
  if (!isDark) return LIGHT_COLORS;
  return DARK_COLORS;
}

export { LIGHT_COLORS as colors };

export type ColorName = keyof typeof LIGHT_COLORS;

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

const LIGHT_COLORS = {
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
};

const DARK_COLORS = {
  paper: "#0D1117",
  surface: "#161B22",
  surfaceAlt: "#1C2129",
  ink: "#E6EDF3",
  inkMuted: "#8B949E",
  inkFaint: "#6E7681",
  saffron: "#F0883E",
  saffronSoft: "#2D1B0E",
  green: "#3FB950",
  greenSoft: "#0D2818",
  amber: "#D29922",
  amberSoft: "#2D1F0A",
  blue: "#58A6FF",
  blueSoft: "#0D1B2A",
  red: "#F85149",
  redSoft: "#2D0F0E",
  border: "#30363D",
  white: "#FFFFFF",
};
