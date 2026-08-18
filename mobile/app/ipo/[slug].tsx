import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { registrarCheck } from "@/src/lib/allotment";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  const dates = [
    { label: "Open", value: formatDate(ipo.openDate) },
    { label: "Close", value: formatDate(ipo.closeDate) },
    { label: "Allotment", value: formatDate(ipo.allotmentDate) },
    { label: "Refund", value: formatDate(ipo.refundDate) },
    { label: "Listing", value: formatDate(ipo.listingDate) },
  ];

  return (
    <>
      <Stack.Screen options={{ title: ipo.companyName }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.company}>{ipo.companyName}</Text>
        <Text style={styles.subtitle}>
          {ipo.board === "MAINBOARD" ? "Mainboard" : "SME"} · {ipo.sector || "Sector not disclosed"}
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Offer details</Text>
          <Row
            label="Price band"
            value={ipo.priceBandLow > 0 && ipo.priceBandHigh > 0 ? `₹${ipo.priceBandLow}–${ipo.priceBandHigh}` : "TBD"}
          />
          <Row label="Lot size" value={ipo.lotSize ? String(ipo.lotSize) : "TBD"} />
          <Row label="Issue size" value={ipo.issueSizeCr ? `₹${ipo.issueSizeCr} Cr` : "TBD"} />
          <Row label="Registrar" value={ipo.registrar ?? "TBD"} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {dates.map((date) => <Row key={date.label} label={date.label} value={date.value} />)}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>GMP</Text>
          {ipo.gmp ? (
            <>
              <Row label="Median" value={`₹${ipo.gmp.medianValue}`} />
              <Row label="Source count" value={String(ipo.gmp.sourceCount)} />
              <Row label="Confidence" value={ipo.gmp.confidence} />
            </>
          ) : (
            <Text style={styles.muted}>
              No tracked GMP quote yet. GMP is unofficial; IPOBharosa only shows quotes from launch-approved
              providers.
            </Text>
          )}
          {ipo.subscription && ipo.subscription.retailX !== null && (
            <>
              <Text style={[styles.sectionTitle, styles.spaced]}>Subscription</Text>
              <Row label="QIB" value={ipo.subscription.qibX !== null ? `${ipo.subscription.qibX}x` : "—"} />
              <Row label="NII" value={ipo.subscription.niiX !== null ? `${ipo.subscription.niiX}x` : "—"} />
              <Row label="Retail" value={`${ipo.subscription.retailX}x`} />
            </>
          )}
        </View>

        {check.portalUrl && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Allotment status</Text>
            <Text style={styles.muted}>
              {check.automatable
                ? "Use the Allotment tab to check automatically via MUFG / Link Intime."
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
  company: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  spaced: {
    marginTop: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  rowValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
    flexShrink: 1,
    marginLeft: 12,
  },
  muted: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
  },
});