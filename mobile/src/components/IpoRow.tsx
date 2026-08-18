import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BoardIpo } from "@/src/lib/types";
import { formatDecimal } from "@/src/lib/format";

export const STATUS_META: Record<BoardIpo["status"], { label: string; color: string }> = {
  OPEN: { label: "Open", color: "#0E6B3A" },
  UPCOMING: { label: "Upcoming", color: "#B45309" },
  CLOSED: { label: "Closed", color: "#6B7280" },
  LISTED: { label: "Listed", color: "#1D4ED8" },
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function IpoRow({ ipo, onPress }: { ipo: BoardIpo; onPress: () => void }) {
  const meta = STATUS_META[ipo.status];
  const priceBand =
    ipo.priceBandLow > 0 && ipo.priceBandHigh > 0 ? `₹${ipo.priceBandLow}–${ipo.priceBandHigh}` : "TBD";
  const issueSize = ipo.issueSizeCr > 0 ? `₹${ipo.issueSizeCr} Cr` : "TBD";
  const pct = gmpPremiumPct(ipo);
  const gmpText = ipo.gmp ? `₹${ipo.gmp.medianValue}${pct !== null ? ` (+${pct}%)` : ""}` : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <Text style={styles.company} numberOfLines={2}>
          {ipo.companyName}
        </Text>
        <View style={[styles.badge, { backgroundColor: meta.color + "14" }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>
        {ipo.board === "MAINBOARD" ? "Mainboard" : "SME"} · {ipo.sector || "Sector not disclosed"}
      </Text>

      <View style={styles.grid}>
        <Stat label="Price band" value={priceBand} />
        <Stat label="Lot size" value={ipo.lotSize ? `${ipo.lotSize} shares` : "TBD"} />
        <Stat label="Issue size" value={issueSize} />
        <Stat
          label={ipo.status === "LISTED" ? "Listing" : "Dates"}
          value={
            ipo.status === "LISTED"
              ? formatDate(ipo.listingDate)
              : `${formatDate(ipo.openDate)} → ${formatDate(ipo.closeDate)}`
          }
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.gmpChip}>
          <Text style={styles.gmpLabel}>GMP</Text>
          <Text style={[styles.gmpValue, gmpText && styles.gmpPositive]} numberOfLines={1}>
            {gmpText ?? "—"}
          </Text>
        </View>
        {ipo.subscription && ipo.subscription.retailX !== null && (
          <View style={styles.subChip}>
            <Text style={styles.subText}>Retail {formatDecimal(ipo.subscription.retailX)}x</Text>
          </View>
        )}
        {!ipo.gmp && !(ipo.subscription && ipo.subscription.retailX !== null) && (
          <Text style={styles.hint}>Tap for details</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  company: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
    lineHeight: 21,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12.5,
    color: "#6B7280",
    marginTop: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  stat: {
    width: "50%",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  gmpChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  gmpLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  gmpValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  gmpPositive: {
    color: "#0E6B3A",
  },
  subChip: {
    backgroundColor: "#1D4ED8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  subText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});