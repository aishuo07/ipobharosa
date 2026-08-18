import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { loadPanCards, type PanCard } from "@/src/lib/pan-store";
import { checkMufgAllotmentForPans, registrarCheck, type AllotmentResult } from "@/src/lib/allotment";
import { cacheAllotmentResult, loadAllotmentCache, type IpoAllotmentCache } from "@/src/lib/allotment-store";

const STATUS_LABELS: Record<AllotmentResult["status"], string> = {
  ALLOTTED: "Allotted",
  NOT_ALLOTTED: "Not allotted",
  NOT_APPLIED: "No application found",
  ERROR: "Could not check",
};

const STATUS_COLORS: Record<AllotmentResult["status"], string> = {
  ALLOTTED: "#0E6B3A",
  NOT_ALLOTTED: "#B91C1C",
  NOT_APPLIED: "#6B7280",
  ERROR: "#B91C1C",
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
      const results = await checkMufgAllotmentForPans(
        ipo,
        cards.map((card) => card.pan),
      );
      let nextCache = cache;
      for (const result of results) {
        nextCache = await cacheAllotmentResult(ipo.id, result);
      }
      setCache(nextCache);
    } finally {
      setChecking(false);
      setCheckingFor(null);
    }
  }

  function openRegistrar(ipo: BoardIpo) {
    const check = registrarCheck(ipo);
    if (check.portalUrl) void Linking.openURL(check.portalUrl);
  }

  const cachedResults = (ipo: BoardIpo): AllotmentResult[] => Object.values(cache[ipo.id] ?? {});

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0E6B3A" />
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
                      <Text style={[styles.panStatus, { color: STATUS_COLORS[result.status] }]}>
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
                  <ActivityIndicator size="small" color="#0E6B3A" />
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
            {registrarCheck(selectedIpo).automatable
              ? "MUFG / Link Intime supports automatic allotment lookup by PAN. Tap \"Check all PANs\" and results will be cached on this device."
              : "This registrar uses a CAPTCHA-protected portal. Use the registrar's official site to check allotment."}
          </Text>
        </View>
      )}
    </ScrollView>
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
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
    marginBottom: 16,
  },
  muted: {
    color: "#6B7280",
    fontSize: 13,
    paddingVertical: 12,
  },
  ipoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  ipoCardActive: {
    borderColor: "#0E6B3A",
  },
  ipoHeader: {
    marginBottom: 8,
  },
  ipoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  ipoMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  ipoFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  ipoSummary: {
    fontSize: 13,
    color: "#6B7280",
  },
  panList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    marginBottom: 8,
  },
  panRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  panText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  panStatus: {
    fontSize: 14,
    fontWeight: "700",
  },
  checkButton: {
    backgroundColor: "#0E6B3A",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  checkButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  sourceNote: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  sourceNoteText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
});