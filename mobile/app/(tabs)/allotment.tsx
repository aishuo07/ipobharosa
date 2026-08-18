import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchBoard } from "@/src/lib/api";
import type { BoardIpo } from "@/src/lib/types";
import { loadPanCards, type PanCard } from "@/src/lib/pan-store";
import { checkMufgAllotment, registrarCheck, type AllotmentResult } from "@/src/lib/allotment";

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

export default function AllotmentScreen() {
  const [ipos, setIpos] = useState<BoardIpo[]>([]);
  const [cards, setCards] = useState<PanCard[]>([]);
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [selectedPan, setSelectedPan] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AllotmentResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [board, pans] = await Promise.all([fetchBoard("ALL"), loadPanCards()]);
        const eligible = board.filter((ipo) => ipo.status === "CLOSED" || ipo.status === "LISTED");
        setIpos(eligible);
        setCards(pans);
        if (eligible[0]) setSelectedIpoId(eligible[0].id);
        if (pans[0]) setSelectedPan(pans[0].pan);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedIpo = ipos.find((ipo) => ipo.id === selectedIpoId) ?? null;

  async function handleCheck() {
    if (!selectedIpo || !selectedPan) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkMufgAllotment(selectedIpo, selectedPan));
    } finally {
      setChecking(false);
    }
  }

  function openRegistrar() {
    if (!selectedIpo) return;
    const check = registrarCheck(selectedIpo);
    if (check.portalUrl) void Linking.openURL(check.portalUrl);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0E6B3A" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>IPO</Text>
      <View style={styles.pickerBox}>
        {ipos.length === 0 ? (
          <Text style={styles.muted}>No closed/listed IPOs available right now.</Text>
        ) : (
          ipos.slice(0, 8).map((ipo) => (
            <TouchableOpacity
              key={ipo.id}
              onPress={() => setSelectedIpoId(ipo.id)}
              style={[styles.option, selectedIpoId === ipo.id && styles.optionActive]}
            >
              <Text style={[styles.optionText, selectedIpoId === ipo.id && styles.optionTextActive]}>
                {ipo.companyName}
              </Text>
              <Text style={[styles.optionMeta, selectedIpoId === ipo.id && styles.optionTextActive]}>
                {ipo.registrar ?? "Registrar TBD"}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <Text style={styles.label}>PAN card</Text>
      <View style={styles.pickerBox}>
        {cards.length === 0 ? (
          <Text style={styles.muted}>Save a PAN card in the PAN Cards tab first.</Text>
        ) : (
          cards.map((card) => (
            <TouchableOpacity
              key={card.id}
              onPress={() => setSelectedPan(card.pan)}
              style={[styles.option, selectedPan === card.pan && styles.optionActive]}
            >
              <Text style={[styles.optionText, selectedPan === card.pan && styles.optionTextActive]}>
                {card.pan}
              </Text>
              <Text style={[styles.optionMeta, selectedPan === card.pan && styles.optionTextActive]}>
                {card.holderName || "Unnamed"}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selectedIpo && (
        <View style={styles.sourceNote}>
          <Text style={styles.sourceNoteText}>
            Registrar: <Text style={styles.sourceNoteStrong}>{selectedIpo.registrar ?? "Unknown"}</Text>
            {"\n"}
            {registrarCheck(selectedIpo).automatable
              ? "This registrar (MUFG / Link Intime) supports automatic allotment lookup by PAN."
              : "This registrar uses a CAPTCHA-protected portal. Tap below to check on the official registrar site."}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.checkButton, (!selectedIpo || !selectedPan) && styles.checkButtonDisabled]}
        onPress={handleCheck}
        disabled={!selectedIpo || !selectedPan || checking}
      >
        <Text style={styles.checkButtonText}>
          {checking ? "Checking…" : "Check allotment"}
        </Text>
      </TouchableOpacity>

      {selectedIpo && (
        <TouchableOpacity style={styles.linkButton} onPress={openRegistrar}>
          <Text style={styles.linkButtonText}>Open official registrar portal</Text>
        </TouchableOpacity>
      )}

      {result && (
        <View style={styles.resultBox}>
          <Text style={[styles.resultStatus, { color: STATUS_COLORS[result.status] }]}>
            {STATUS_LABELS[result.status]}
          </Text>
          {result.applicant ? <Text style={styles.resultRow}>Applicant: {result.applicant}</Text> : null}
          {result.applied !== undefined && result.applied !== "" ? (
            <Text style={styles.resultRow}>Applied: {result.applied}</Text>
          ) : null}
          {result.allotted !== undefined && result.allotted !== "" && result.status !== "ERROR" ? (
            <Text style={styles.resultRow}>Allotted: {result.allotted}</Text>
          ) : null}
          {result.error ? <Text style={styles.resultError}>{result.error}</Text> : null}
          <Text style={styles.resultNote}>
            Result reflects the official registrar lookup for {result.companyName}. Always confirm large decisions
            on the official registrar site.
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
  label: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
  },
  pickerBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
  },
  option: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  optionActive: {
    backgroundColor: "#E8F5EE",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  optionText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  optionTextActive: {
    color: "#0E6B3A",
    fontWeight: "700",
  },
  optionMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  muted: {
    color: "#6B7280",
    fontSize: 13,
    paddingVertical: 12,
  },
  sourceNote: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  sourceNoteText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
  sourceNoteStrong: {
    fontWeight: "700",
  },
  checkButton: {
    backgroundColor: "#0E6B3A",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  checkButtonDisabled: {
    opacity: 0.5,
  },
  checkButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  linkButton: {
    marginTop: 10,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0E6B3A",
    borderRadius: 10,
  },
  linkButtonText: {
    color: "#0E6B3A",
    fontSize: 14,
    fontWeight: "600",
  },
  resultBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  resultStatus: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  resultRow: {
    fontSize: 14,
    color: "#111827",
    marginBottom: 4,
  },
  resultError: {
    fontSize: 13,
    color: "#B91C1C",
    marginTop: 4,
  },
  resultNote: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 10,
    lineHeight: 17,
  },
});