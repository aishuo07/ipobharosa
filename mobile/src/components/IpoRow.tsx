import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BoardIpo } from "@/src/lib/types";
import { formatDecimal } from "@/src/lib/format";
import { effectiveStatus, STATUS_LABELS, type EffectiveStatus } from "@/src/lib/status";
import { colors, radius, spacing, typography, statusColor, statusSoftColor } from "@/src/lib/theme";

const EFFECTIVE_META: Record<EffectiveStatus, { color: string; soft: string }> = {
  open: { color: colors[statusColor("OPEN")], soft: colors[statusSoftColor("OPEN")] },
  "closing-soon": { color: colors[statusColor("closing-soon")], soft: colors[statusSoftColor("closing-soon")] },
  upcoming: { color: colors[statusColor("UPCOMING")], soft: colors[statusSoftColor("UPCOMING")] },
  closed: { color: colors[statusColor("CLOSED")], soft: colors[statusSoftColor("CLOSED")] },
  "listed-pending": { color: colors[statusColor("UPCOMING")], soft: colors[statusSoftColor("UPCOMING")] },
  "listed-gain": { color: colors[statusColor("LISTED")], soft: colors[statusSoftColor("LISTED")] },
  "listed-loss": { color: colors[statusColor("CLOSED")], soft: colors[statusSoftColor("CLOSED")] },
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
  const es = effectiveStatus(ipo, Date.now());
  const meta = EFFECTIVE_META[es];
  const statusLabel = STATUS_LABELS[es];
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
        <View style={[styles.badge, { backgroundColor: meta.soft }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{statusLabel}</Text>
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
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
    fontSize: typography.body.fontSize + 2,
    fontWeight: "700",
    color: colors.ink,
    flex: 1,
    marginRight: spacing.sm,
    lineHeight: 21,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.inkMuted,
    marginTop: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
  },
  stat: {
    width: "50%",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  statLabel: {
    fontSize: 11,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.ink,
    marginTop: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm + 2,
  },
  gmpChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  gmpLabel: {
    fontSize: 11,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  gmpValue: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.inkMuted,
  },
  gmpPositive: {
    color: colors.green,
  },
  subChip: {
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  subText: {
    color: colors.white,
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  hint: {
    fontSize: typography.caption.fontSize,
    color: colors.inkFaint,
  },
});