import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { registrarCheck } from "@/src/lib/allotment";
import { STATUS_META } from "@/src/components/IpoRow";
import { formatDecimal, formatMoney, formatPercent } from "@/src/lib/format";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

type TimelineStep = { label: string; date: string; key: "open" | "close" | "allotment" | "refund" | "listing" };

function Timeline({ ipo }: { ipo: BoardIpo }) {
  const steps: TimelineStep[] = [
    { label: "Open", date: ipo.openDate, key: "open" },
    { label: "Close", date: ipo.closeDate, key: "close" },
    { label: "Allotment", date: ipo.allotmentDate, key: "allotment" },
    { label: "Refund", date: ipo.refundDate, key: "refund" },
    { label: "Listing", date: ipo.listingDate, key: "listing" },
  ];

  const doneCount = {
    UPCOMING: 0,
    OPEN: 1,
    CLOSED: 2,
    LISTED: 5,
  }[ipo.status];
  const currentIndex = Math.min(doneCount, steps.length - 1);

  return (
    <View style={styles.timeline}>
      {steps.map((step, index) => {
        const isDone = index < doneCount;
        const isCurrent = index === currentIndex && !isDone;
        const isPast = index < doneCount;
        const isFuture = index > currentIndex;
        return (
          <View key={step.key} style={styles.timelineStep}>
            <View style={styles.timelineRail}>
              {index < steps.length - 1 && (
                <View style={[styles.timelineLine, isPast && styles.timelineLineDone]} />
              )}
              <View
                style={[
                  styles.timelineDot,
                  isDone && styles.timelineDotDone,
                  isCurrent && styles.timelineDotCurrent,
                ]}
              >
                {isDone && <Text style={styles.timelineCheck}>✓</Text>}
              </View>
            </View>
            <View style={styles.timelineBody}>
              <Text
                style={[
                  styles.timelineLabel,
                  (isDone || isCurrent) && styles.timelineLabelActive,
                  isFuture && styles.timelineLabelFuture,
                ]}
              >
                {step.label}
              </Text>
              <Text style={[styles.timelineDate, isCurrent && styles.timelineDateCurrent]}>
                {formatDate(step.date)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SubscriptionBars({ ipo }: { ipo: BoardIpo }) {
  if (!ipo.subscription) return null;
  const { qibX, niiX, retailX, employeeX } = ipo.subscription;
  const rows = [
    { label: "QIB", value: qibX },
    { label: "NII", value: niiX },
    { label: "Retail", value: retailX },
    { label: "Employee", value: employeeX },
  ].filter((row) => row.value !== null) as { label: string; value: number }[];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <View style={styles.subscription}>
      {rows.map((row) => (
        <View key={row.label} style={styles.subRow}>
          <Text style={styles.subLabel}>{row.label}</Text>
          <View style={styles.subTrack}>
            <View
              style={[
                styles.subFill,
                { width: `${Math.min((row.value / max) * 100, 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.subValue}>{formatDecimal(row.value)}x</Text>
        </View>
      ))}
      {ipo.subscription.sourceName && (
        <Text style={styles.muted}>Source: {ipo.subscription.sourceName}</Text>
      )}
    </View>
  );
}

export default function IpoDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [ipo, setIpo] = useState<BoardIpo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const board = await fetchBoard("ALL");
        const found = board.find((item) => item.slug === slug);
        if (!found) {
          setError("IPO not found on the board.");
          return;
        }
        setIpo(found);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load IPO details");
      }
    })();
  }, [slug]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!ipo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0E6B3A" />
      </View>
    );
  }

  const check = registrarCheck(ipo);
  const statusMeta = STATUS_META[ipo.status];
  const priceBand =
    ipo.priceBandLow > 0 && ipo.priceBandHigh > 0 ? `₹${ipo.priceBandLow}–${ipo.priceBandHigh}` : "TBD";
  const gmpPct = ipo.gmp && ipo.priceBandHigh > 0 ? Math.round((ipo.gmp.medianValue / ipo.priceBandHigh) * 1000) / 10 : null;
  const gmpDisclaimer = "GMP is unofficial market sentiment, not a guarantee of listing price.";

  return (
    <>
      <Stack.Screen options={{ title: ipo.companyName }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.boardChip}>
              {ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}
            </Text>
            <View style={[styles.badge, { backgroundColor: statusMeta.color + "14" }]}>
              <Text style={[styles.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
          </View>
          <Text style={styles.company}>{ipo.companyName}</Text>
          <Text style={styles.subtitle}>{ipo.sector || "Sector not disclosed"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Key facts</Text>
          <View style={styles.factsGrid}>
            <Fact label="Price band" value={priceBand} />
            <Fact label="Lot size" value={ipo.lotSize ? String(ipo.lotSize) : "TBD"} />
            <Fact label="Issue size" value={ipo.issueSizeCr ? `₹${ipo.issueSizeCr} Cr` : "TBD"} />
            <Fact label="Registrar" value={ipo.registrar ?? "TBD"} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <Timeline ipo={ipo} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>GMP</Text>
          {ipo.gmp ? (
            <>
              <View style={styles.gmpHero}>
                <Text style={styles.gmpValue}>₹{formatMoney(ipo.gmp.medianValue)}</Text>
                {gmpPct !== null && <Text style={styles.gmpPct}>+{formatPercent(gmpPct)}%</Text>}
                {ipo.priceBandHigh > 0 && (
                  <Text style={styles.gmpEst}>
                    Est. listing ₹{formatMoney(ipo.priceBandHigh + ipo.gmp.medianValue)}
                  </Text>
                )}
              </View>
              <View style={styles.gmpMeta}>
                <View style={styles.gmpMetaItem}>
                  <Text style={styles.gmpMetaLabel}>Sources</Text>
                  <Text style={styles.gmpMetaValue}>{ipo.gmp.sourceCount}</Text>
                </View>
                <View style={styles.gmpMetaItem}>
                  <Text style={styles.gmpMetaLabel}>Confidence</Text>
                  <Text style={styles.gmpMetaValue}>{ipo.gmp.confidence}</Text>
                </View>
                <View style={styles.gmpMetaItem}>
                  <Text style={styles.gmpMetaLabel}>Deviation</Text>
                  <Text style={styles.gmpMetaValue}>±₹{formatMoney(ipo.gmp.maxDeviation)}</Text>
                </View>
              </View>
              <Text style={[styles.muted, styles.spaced]}>{gmpDisclaimer}</Text>
            </>
          ) : (
            <Text style={styles.muted}>
              No tracked GMP quote yet. GMP is unofficial; IPOBharosa only shows quotes from launch-approved
              providers.
            </Text>
          )}
        </View>

        {ipo.subscription && ipo.subscription.retailX !== null && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <SubscriptionBars ipo={ipo} />
          </View>
        )}

        {check.portalUrl && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Allotment status</Text>
            <Text style={styles.muted}>
              {check.automatable
                ? "Use the Allotment tab to check automatically via MUFG / Link Intime / KFinTech / Bigshare."
                : "This registrar uses a CAPTCHA-protected portal. Open it from the Allotment tab to check your status."}
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF7F2",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FAF7F2",
  },
  error: {
    color: "#B91C1C",
  },
  hero: {
    marginBottom: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  boardChip: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    backgroundColor: "#EEF0F3",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  company: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  spaced: {
    marginTop: 12,
  },
  factsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fact: {
    width: "50%",
    paddingVertical: 6,
    paddingRight: 12,
  },
  factLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  factValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 2,
  },
  timeline: {
    marginTop: 2,
  },
  timelineStep: {
    flexDirection: "row",
    minHeight: 46,
  },
  timelineRail: {
    width: 28,
    alignItems: "center",
  },
  timelineLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#E5E7EB",
  },
  timelineLineDone: {
    backgroundColor: "#0E6B3A",
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: {
    borderColor: "#0E6B3A",
    backgroundColor: "#0E6B3A",
  },
  timelineDotCurrent: {
    borderColor: "#0E6B3A",
    backgroundColor: "#FFFFFF",
  },
  timelineCheck: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 14,
    marginLeft: 6,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  timelineLabelActive: {
    color: "#1F2937",
  },
  timelineLabelFuture: {
    color: "#9CA3AF",
  },
  timelineDate: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  timelineDateCurrent: {
    color: "#0E6B3A",
    fontWeight: "700",
  },
  gmpHero: {
    alignItems: "center",
    paddingVertical: 6,
  },
  gmpValue: {
    fontSize: 40,
    fontWeight: "800",
    color: "#0E6B3A",
  },
  gmpPct: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0E6B3A",
    marginTop: 2,
  },
  gmpEst: {
    fontSize: 14,
    color: "#4B5563",
    marginTop: 6,
  },
  gmpMeta: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  gmpMetaItem: {
    alignItems: "center",
  },
  gmpMetaLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  gmpMetaValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 2,
  },
  subscription: {
    gap: 8,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subLabel: {
    width: 64,
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  subTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  subFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#0E6B3A",
  },
  subValue: {
    width: 44,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
  },
  muted: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
  },
});