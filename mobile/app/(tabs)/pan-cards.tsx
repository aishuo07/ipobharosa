import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { addPanCard, isValidPan, loadPanCards, removePanCard, type PanCard } from "@/src/lib/pan-store";

export default function PanCardsScreen() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [pan, setPan] = useState("");
  const [holderName, setHolderName] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadPanCards().then(setCards);
    }, []),
  );

  async function handleAdd() {
    if (!isValidPan(pan)) {
      Alert.alert("Invalid PAN", "PAN must match the format ABCDE1234F.");
      return;
    }
    if (!holderName.trim()) {
      Alert.alert("Missing name", "Enter the holder name as shown on the card.");
      return;
    }
    setSaving(true);
    try {
      const card = await addPanCard(pan, holderName);
      setCards((current) => [...current, card]);
      setPan("");
      setHolderName("");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    await removePanCard(id);
    setCards((current) => current.filter((card) => card.id !== id));
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Private, on-device only</Text>
          <Text style={styles.noteText}>
            PAN cards are stored encrypted on this device only. They are never sent to any server and are used only
            to check your own allotment status on official registrar sites.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Holder name</Text>
          <TextInput
            style={styles.input}
            value={holderName}
            onChangeText={setHolderName}
            placeholder="e.g. Aisha Sharma"
            autoCapitalize="words"
          />
          <Text style={styles.label}>PAN number</Text>
          <TextInput
            style={styles.input}
            value={pan}
            onChangeText={(value) => setPan(value.toUpperCase())}
            placeholder="ABCDE1234F"
            autoCapitalize="characters"
            maxLength={10}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAdd} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save PAN card"}</Text>
          </TouchableOpacity>
        </View>

        {cards.length === 0 ? (
          <Text style={styles.empty}>No PAN cards saved yet.</Text>
        ) : (
          cards.map((card) => (
            <View key={card.id} style={styles.card}>
              <View>
                <Text style={styles.cardName}>{card.holderName || "Unnamed"}</Text>
                <Text style={styles.cardPan}>{card.pan}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemove(card.id)}>
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  note: {
    backgroundColor: "#E8F5EE",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0E6B3A",
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
  form: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#0E6B3A",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  empty: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 24,
  },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  cardPan: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 2,
  },
  remove: {
    color: "#B91C1C",
    fontSize: 14,
  },
});