import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { BoardIpo } from "@/src/lib/types";
import { colors, radius, spacing, typography } from "@/src/lib/theme";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function GmpChart({ ipo }: { ipo: BoardIpo }) {
  const history = ipo.gmpHistory ?? [];

  const chart = useMemo(() => {
    if (history.length === 0) return null;

    const values = history.map((h) => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const barHeight = 80;

    return {
      bars: history.map((h) => ({
        value: h.value,
        date: formatDate(h.capturedAt),
        height: Math.max(4, ((h.value - min) / range) * barHeight),
        isLatest: h === history[history.length - 1],
      })),
      min,
      max,
    };
  }, [history]);

  if (history.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>GMP History</Text>
        <Text style={styles.empty}>No GMP data yet</Text>
      </View>
    );
  }

  if (!chart) return null;

  const latestGmp = history[history.length - 1].value;
  const prevGmp = history.length > 1 ? history[history.length - 2].value : latestGmp;
  const trend = latestGmp - prevGmp;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GMP History</Text>
        <View style={styles.legend}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>₹/share</Text>
        </View>
      </View>

      <View style={styles.chart}>
        {chart.bars.map((bar, i) => (
          <View key={i} style={styles.barCol}>
            <Text style={[styles.barValue, bar.isLatest && styles.barValueLatest]}>
              ₹{bar.value}
            </Text>
            <View
              style={[
                styles.bar,
                {
                  height: bar.height,
                  backgroundColor: bar.isLatest ? colors.green : colors.greenSoft,
                },
              ]}
            />
            {bar.isLatest || i === 0 ? (
              <Text style={styles.barDate}>{bar.date}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>
          Range: ₹{chart.min} — ₹{chart.max}
        </Text>
        {trend !== 0 && (
          <Text style={[styles.footerTrend, { color: trend > 0 ? colors.green : colors.red }]}>
            {trend > 0 ? "▲" : "▼"} ₹{Math.abs(trend)} from previous
          </Text>
        )}
      </View>
    </View>
  );
}

export function SubscriptionBar({ ipo }: { ipo: BoardIpo }) {
  const sub = ipo.subscription;
  if (!sub) return null;

  const categories = [
    { label: "QIB", value: sub.qibX },
    { label: "NII", value: sub.niiX },
    { label: "Retail", value: sub.retailX },
    { label: "Employee", value: sub.employeeX },
  ].filter((c) => c.value != null && c.value > 0);

  if (categories.length === 0) return null;

  const maxValue = Math.max(...categories.map((c) => c.value ?? 0));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Subscription Status</Text>
        <Text style={styles.subtitle}>
          {sub.totalX ? `${sub.totalX.toFixed(1)}x overall` : ""}
        </Text>
      </View>

      <View style={styles.subBars}>
        {categories.map((cat) => {
          const width = maxValue > 0 ? ((cat.value ?? 0) / maxValue) * 100 : 0;
          const isHigh = (cat.value ?? 0) >= 3;
          return (
            <View key={cat.label} style={styles.subRow}>
              <Text style={styles.subLabel}>{cat.label}</Text>
              <View style={styles.subTrack}>
                <View
                  style={[
                    styles.subFill,
                    {
                      width: `${Math.min(100, width)}%`,
                      backgroundColor: isHigh ? colors.green : colors.blue,
                    },
                  ]}
                />
              </View>
              <Text style={styles.subValue}>{cat.value?.toFixed(1)}x</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.footerLabel}>Source: {sub.sourceName ?? "Registrar"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  legendText: {
    fontSize: 12,
    color: colors.inkFaint,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 120,
    paddingBottom: spacing.xl,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: 24,
    borderRadius: 4,
  },
  barValue: {
    fontSize: 10,
    color: colors.inkMuted,
    marginBottom: 4,
  },
  barValueLatest: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.green,
  },
  barDate: {
    fontSize: 10,
    color: colors.inkFaint,
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  footerLabel: {
    fontSize: 12,
    color: colors.inkFaint,
  },
  footerTrend: {
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    color: colors.inkMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  subBars: {
    gap: spacing.md,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  subLabel: {
    width: 60,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkMuted,
  },
  subTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: "hidden",
  },
  subFill: {
    height: "100%",
    borderRadius: 4,
  },
  subValue: {
    width: 50,
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "right",
  },
});
