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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { addPanCard, isValidPan, loadPanCards, removePanCard, type PanCard } from "@/src/lib/pan-store";
import { colors, radius, spacing, typography } from "@/src/lib/theme";

export default function PanCardsScreen() {
  const posthog = usePostHog();
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
      posthog?.capture("pan_add", { screen: "pan_cards" });
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
    posthog?.capture("pan_removed", { screen: "pan_cards" });
    setCards((current) => current.filter((card) => card.id !== id));
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <View style={styles.noteIcon}>
            <Ionicons name="shield-checkmark" size={20} color={colors.green} />
          </View>
          <View style={styles.noteBody}>
            <Text style={styles.noteTitle}>Private, on-device only</Text>
            <Text style={styles.noteText}>
              PAN cards are stored encrypted on this device only. They are never sent to any server and are used only
              to check your own allotment status on official registrar sites.
            </Text>
          </View>
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
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  noteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  noteBody: {
    flex: 1,
  },
  noteTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.green,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    color: colors.inkMuted,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  saveButton: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  empty: {
    textAlign: "center",
    color: colors.inkMuted,
    marginTop: spacing.xl,
  },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  cardPan: {
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  remove: {
    color: colors.red,
    fontSize: typography.body.fontSize,
  },
});