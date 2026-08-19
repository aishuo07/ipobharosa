import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { loadPanCards, type PanCard } from "@/src/lib/pan-store";
import { checkAllotmentForPans, registrarCheck, type AllotmentResult } from "@/src/lib/allotment";
import { cacheAllotmentResult, loadAllotmentCache, type IpoAllotmentCache } from "@/src/lib/allotment-store";
import { colors, radius, spacing, typography, statusColor } from "@/src/lib/theme";

const STATUS_LABELS: Record<AllotmentResult["status"], string> = {
  ALLOTTED: "Allotted",
  NOT_ALLOTTED: "Not allotted",
  NOT_APPLIED: "No application found",
  ERROR: "Could not check",
};

function statusCounts(results: AllotmentResult[]) {
  const counts = { ALLOTTED: 0, NOT_ALLOTTED: 0, NOT_APPLIED: 0, ERROR: 0 };
  for (const result of results) counts[result.status]++;
  return counts;
}

export default function AllotmentScreen() {
  const [ipos, setIpos] = useState<BoardIpo[]>([]);
  const [cards, setCards] = useState<PanCard[]>([]);
  const [cache, setCache] = useState<IpoAllotmentCache>({});
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkingFor, setCheckingFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [board, pans, allotmentCache] = await Promise.all([fetchBoard("ALL"), loadPanCards(), loadAllotmentCache()]);
        const eligible = board.filter((ipo) => ipo.status === "CLOSED" || ipo.status === "LISTED");
        setIpos(eligible);
        setCards(pans);
        setCache(allotmentCache);
        if (eligible[0]) setSelectedIpoId(eligible[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedIpo = ipos.find((ipo) => ipo.id === selectedIpoId) ?? null;

  async function handleCheck(ipo: BoardIpo) {
    if (cards.length === 0 || checking) return;
    setChecking(true);
    setCheckingFor(ipo.id);
    try {
      const results = await checkAllotmentForPans(
        ipo,
        cards.map((card) => card.pan),
      );
      let nextCache = cache;
      for (const result of results) {
        nextCache = await cacheAllotmentResult(ipo.id, result);
      }
      setCache({ ...cache, ...nextCache });
    } finally {
      setChecking(false);
      setCheckingFor(null);
    }
  }

  function openRegistrar(ipo: BoardIpo) {
    const check = registrarCheck(ipo);
    if (!check.portalUrl) return;
    void Linking.canOpenURL(check.portalUrl)
      .then((supported) => {
        if (!supported) {
          Alert.alert(
            "Cannot open portal",
            `Your browser could not open the registrar portal automatically.\n\n${check.portalUrl}\n\nUse the share sheet to copy the link and open it in your browser.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Share link", onPress: () => void shareLink(check.portalUrl!) },
            ],
          );
          return;
        }
        return Linking.openURL(check.portalUrl!);
      })
      .catch(() => {
        Alert.alert(
          "Cannot open portal",
          `Something went wrong opening the registrar portal.\n\n${check.portalUrl}`,
          [{ text: "OK" }],
        );
      });
  }

  function shareLink(url: string) {
    void Share.share({ message: url }).catch(() => {
      /* share sheet may be unavailable */
    });
  }

  const cachedResults = (ipo: BoardIpo): AllotmentResult[] => Object.values(cache[ipo.id] ?? {});

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Allotment status</Text>
      <Text style={styles.subheading}>
        {cards.length === 0
          ? "Save a PAN card in the PAN Cards tab first, then check each IPO."
          : `Checking allotment for ${cards.length} saved PAN card${cards.length === 1 ? "" : "s"}. Results are saved on this device, so you only need to check each IPO once.`}
      </Text>

      {ipos.length === 0 ? (
        <Text style={styles.muted}>No closed/listed IPOs available right now.</Text>
      ) : (
        ipos.map((ipo) => {
          const results = cachedResults(ipo);
          const counts = statusCounts(results);
          const isSelected = ipo.id === selectedIpoId;
          const isChecking = checking && checkingFor === ipo.id;
          const isAutomatable = registrarCheck(ipo).automatable;
          return (
            <TouchableOpacity
              key={ipo.id}
              style={[styles.ipoCard, isSelected && styles.ipoCardActive]}
              onPress={() => setSelectedIpoId(ipo.id)}
            >
              <View style={styles.ipoHeader}>
                <Text style={styles.ipoName}>{ipo.companyName}</Text>
                <Text style={styles.ipoMeta}>{ipo.registrar ?? "Registrar TBD"}</Text>
              </View>

              {results.length > 0 && (
                <View style={styles.panList}>
                  {results.map((result) => (
                    <View key={result.pan} style={styles.panRow}>
                      <Text style={styles.panText}>{result.pan}</Text>
                      <Text style={[styles.panStatus, { color: colors[statusColor(result.status)] }]}>
                        {STATUS_LABELS[result.status]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.ipoFooter}>
                <Text style={styles.ipoSummary}>
                  {results.length === 0
                    ? "Not checked yet"
                    : `${counts.ALLOTTED} allotted · ${counts.NOT_ALLOTTED} not · ${counts.NOT_APPLIED} no application`}
                </Text>
                {isChecking ? (
                  <ActivityIndicator size="small" color={colors.green} />
                ) : isAutomatable ? (
                  <TouchableOpacity style={styles.checkButton} onPress={() => void handleCheck(ipo)}>
                    <Text style={styles.checkButtonText}>Check all PANs</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.checkButton} onPress={() => openRegistrar(ipo)}>
                    <Text style={styles.checkButtonText}>Open registrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {selectedIpo && registrarCheck(selectedIpo).automatable && (
        <View style={styles.sourceNote}>
          <Text style={styles.sourceNoteText}>
            Automatic lookup by PAN is supported for MUFG / Link Intime, KFinTech and Bigshare issues. Tap {"\""}Check all PANs{"\""} and results are cached on this device.
          </Text>
        </View>
      )}
    </ScrollView>
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
  },
  heading: {
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 4,
  },
  subheading: {
    fontSize: typography.caption.fontSize,
    color: colors.inkMuted,
    lineHeight: typography.caption.lineHeight,
    marginBottom: spacing.lg,
  },
  muted: {
    color: colors.inkMuted,
    fontSize: typography.caption.fontSize,
    paddingVertical: spacing.md,
  },
  ipoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ipoCardActive: {
    borderColor: colors.green,
  },
  ipoHeader: {
    marginBottom: spacing.sm,
  },
  ipoName: {
    fontSize: typography.body.fontSize + 2,
    fontWeight: "700",
    color: colors.ink,
  },
  ipoMeta: {
    fontSize: typography.caption.fontSize,
    color: colors.inkMuted,
    marginTop: 2,
  },
  ipoFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  ipoSummary: {
    fontSize: typography.caption.fontSize,
    color: colors.inkMuted,
  },
  panList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  panRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  panText: {
    fontSize: typography.body.fontSize,
    color: colors.ink,
    fontWeight: "600",
  },
  panStatus: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
  },
  checkButton: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  checkButtonText: {
    color: colors.white,
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  sourceNote: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sourceNoteText: {
    fontSize: typography.caption.fontSize,
    color: colors.ink,
    lineHeight: typography.caption.lineHeight,
  },
});