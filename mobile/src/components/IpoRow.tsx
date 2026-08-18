import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BoardIpo } from "@/src/lib/types";

const STATUS_COLORS: Record<BoardIpo["status"], string> = {
  OPEN: "#0E6B3A",
  UPCOMING: "#B45309",
  CLOSED: "#B45309",
  LISTED: "#1D4ED8",
};

const STATUS_LABELS: Record<BoardIpo["status"], string> = {
  OPEN: "Open",
  UPCOMING: "Upcoming",
  CLOSED: "Closed",
  LISTED: "Listed",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function gmpPremiumPct(ipo: BoardIpo): number | null {
  if (!ipo.gmp || ipo.priceBandHigh <= 0) return null;
  return Math.round((ipo.gmp.medianValue / ipo.priceBandHigh) * 1000) / 10;
}

function gmpText(ipo: BoardIpo): string {
  if (ipo.gmp) {
    const pct = gmpPremiumPct(ipo);
    return pct !== null ? `₹${ipo.gmp.medianValue} (+${pct}%)` : `₹${ipo.gmp.medianValue}`;
  }
  if (ipo.gmpAvailability) {
    if (ipo.gmpAvailability.state === "AVAILABLE") return "—";
    return "No tracked GMP quote yet";
  }
  return "No tracked GMP quote yet";
}

export function IpoRow({ ipo, onPress }: { ipo: BoardIpo; onPress: () => void }) {
  const priceBand = ipo.priceBandLow > 0 && ipo.priceBandHigh > 0
    ? `₹${ipo.priceBandLow}–${ipo.priceBandHigh}`
    : "Price TBD";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <Text style={styles.company}>{ipo.companyName}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[ipo.status] + "18" }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLORS[ipo.status] }]}>{STATUS_LABELS[ipo.status]}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{priceBand}</Text>
        <Text style={styles.metaText}>Lot {ipo.lotSize}</Text>
        <Text style={styles.metaText}>
          {ipo.openDate ? formatDate(ipo.openDate) : "—"} → {ipo.closeDate ? formatDate(ipo.closeDate) : "—"}
        </Text>
      </View>
      <View style={styles.gmpLine}>
        <Text style={styles.gmpLabel}>GMP</Text>
        <Text style={[styles.gmpValue, ipo.gmp && styles.gmpPositive]}>{gmpText(ipo)}</Text>
        {ipo.subscription && ipo.subscription.retailX !== null && (
          <Text style={styles.subText}>Retail {ipo.subscription.retailX}x</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  company: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  metaText: {
    fontSize: 13,
    color: "#4B5563",
  },
  gmpLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  gmpLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gmpValue: {
    fontSize: 13,
    color: "#6B7280",
  },
  gmpPositive: {
    color: "#0E6B3A",
    fontWeight: "600",
  },
  subText: {
    fontSize: 13,
    color: "#1D4ED8",
    marginLeft: "auto",
  },
});