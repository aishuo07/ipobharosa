import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { usePostHog } from "posthog-react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { registrarCheck } from "@/src/lib/allotment";
import { effectiveStatus, STATUS_LABELS, type EffectiveStatus } from "@/src/lib/status";
import { formatDecimal, formatMoney, formatPercent } from "@/src/lib/format";
import { useThemeColors, radius, spacing, typography, statusColor, statusSoftColor } from "@/src/lib/theme";
import { GmpChart, SubscriptionBar } from "@/src/components/Charts";
import {
  applicationAmount,
  loadInvestorProfiles,
  type InvestorProfile,
} from "@/src/lib/investor-profile";

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
  const colors = useThemeColors();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const posthog = usePostHog();
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
        posthog?.capture("ipo_view", { screen: "ipo_detail", ipo_slug: slug, ipo_name: found.companyName });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load IPO details");
      }
    })();
  }, [slug, posthog]);

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
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const check = registrarCheck(ipo);
  const es = effectiveStatus(ipo, Date.now());
  const statusLabel = STATUS_LABELS[es];
  const meta = EFFECTIVE_META[es];
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
            <View style={[styles.badge, { backgroundColor: meta.soft }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{statusLabel}</Text>
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

        {ipo.gmpHistory && ipo.gmpHistory.length > 1 && (
          <GmpChart ipo={ipo} />
        )}

        {ipo.subscription && ipo.subscription.retailX !== null && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <SubscriptionBars ipo={ipo} />
          </View>
        )}

        {ipo.subscription && ipo.subscription.retailX !== null && (
          <SubscriptionBar ipo={ipo} />
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

        {ipo.status === "OPEN" && <ApplyCard ipo={ipo} />}
      </ScrollView>
    </>
  );
}

function ApplyCard({ ipo }: { ipo: BoardIpo }) {
  const [profiles, setProfiles] = useState<InvestorProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lots, setLots] = useState("1");

  useEffect(() => {
    void loadInvestorProfiles().then((list) => {
      setProfiles(list);
      if (list.length === 1) setSelectedId(list[0].id);
    });
  }, []);

  const lotsNum = Math.max(1, parseInt(lots, 10) || 1);
  const amount = applicationAmount(ipo, lotsNum);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Apply</Text>
      <Text style={styles.muted}>
        In-app IPO application is coming soon via a partner intermediary — no broker login needed, just PAN,
        demat and UPI. Pick who is applying to pre-fill the request.
      </Text>

      {profiles.length === 0 ? (
        <Text style={styles.muted}>
          No investor profiles saved yet. Add them in the Investors tab first.
        </Text>
      ) : (
        <>
          <Text style={styles.applyLabel}>Applicant</Text>
          <View style={styles.applyPicker}>
            {profiles.map((profile) => (
              <TouchableOpacity
                key={profile.id}
                style={[styles.applyOption, selectedId === profile.id && styles.applyOptionActive]}
                onPress={() => setSelectedId(profile.id)}
              >
                <Text style={[styles.applyOptionText, selectedId === profile.id && styles.applyOptionTextActive]}>
                  {profile.holderName || profile.pan}
                </Text>
                <Text style={styles.applyOptionSub}>
                  {profile.pan} · {profile.dematProvider ?? ""} {profile.dematClientId}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.applyLabel}>Lots</Text>
          <TextInput
            style={styles.applyInput}
            value={lots}
            onChangeText={setLots}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.applyAmountRow}>
            <Text style={styles.applyAmount}>₹{amount.toLocaleString("en-IN")}</Text>
            <Text style={styles.muted}>≈ {lotsNum} lot{lotsNum !== 1 ? "s" : ""}</Text>
          </View>

          <TouchableOpacity style={[styles.applyButton, styles.applyButtonDisabled]} disabled>
            <Text style={styles.applyButtonText}>Apply — coming soon</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  error: {
    color: colors.red,
  },
  hero: {
    marginBottom: spacing.lg,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm + 2,
  },
  boardChip: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    color: colors.inkMuted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  company: {
    fontSize: typography.display.fontSize,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: typography.body.fontSize,
    color: colors.inkMuted,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: spacing.sm + 2,
    letterSpacing: 0.2,
  },
  spaced: {
    marginTop: spacing.md,
  },
  factsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fact: {
    width: "50%",
    paddingVertical: 6,
    paddingRight: spacing.md,
  },
  factLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  factValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
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
    backgroundColor: colors.border,
  },
  timelineLineDone: {
    backgroundColor: colors.green,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  timelineDotCurrent: {
    borderColor: colors.green,
    backgroundColor: colors.surface,
  },
  timelineCheck: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.lg,
    marginLeft: 6,
  },
  timelineLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.inkFaint,
  },
  timelineLabelActive: {
    color: colors.ink,
  },
  timelineLabelFuture: {
    color: colors.inkFaint,
  },
  timelineDate: {
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  timelineDateCurrent: {
    color: colors.green,
    fontWeight: "700",
  },
  gmpHero: {
    alignItems: "center",
    paddingVertical: 6,
  },
  gmpValue: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.green,
  },
  gmpPct: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.green,
    marginTop: 2,
  },
  gmpEst: {
    fontSize: typography.body.fontSize,
    color: colors.inkMuted,
    marginTop: 6,
  },
  gmpMeta: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  gmpMetaItem: {
    alignItems: "center",
  },
  gmpMetaLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  gmpMetaValue: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 2,
  },
  subscription: {
    gap: spacing.sm,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  subLabel: {
    width: 64,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkMuted,
  },
  subTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  subFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  subValue: {
    width: 44,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  muted: {
    fontSize: 13,
    color: colors.inkMuted,
    lineHeight: 19,
  },
  applyLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  applyPicker: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  applyOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  applyOptionActive: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  applyOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  applyOptionTextActive: {
    color: colors.green,
  },
  applyOptionSub: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
  },
  applyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  applyAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  applyAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.green,
    fontVariant: ["tabular-nums"],
  },
  applyButton: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: spacing.md,
  },
  applyButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  applyButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});