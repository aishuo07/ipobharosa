import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import QRCode from "react-native-qrcode-svg";
import {
  addInvestorProfile,
  isValidDematClientId,
  isValidPan,
  isValidUpiId,
  loadInvestorProfiles,
  removeInvestorProfile,
  type InvestorProfile,
  type UpiMandate,
} from "@/src/lib/investor-profile";
import { colors, radius, spacing, typography } from "@/src/lib/theme";

export default function InvestorsScreen() {
  const posthog = usePostHog();
  const [profiles, setProfiles] = useState<InvestorProfile[]>([]);
  const [holderName, setHolderName] = useState("");
  const [pan, setPan] = useState("");
  const [upiId, setUpiId] = useState("");
  const [dematProvider, setDematProvider] = useState<"CDSL" | "NSDL" | null>(null);
  const [dematClientId, setDematClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [mandate, setMandate] = useState<UpiMandate | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadInvestorProfiles().then(setProfiles);
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
    if (!isValidUpiId(upiId)) {
      Alert.alert("Invalid UPI ID", "Enter a valid UPI ID like 9876543210@ybl.");
      return;
    }
    if (!dematProvider || !isValidDematClientId(dematClientId, dematProvider)) {
      Alert.alert("Invalid demat details", "Enter the full demat client ID: 16 digits for CDSL or 14 digits for NSDL (DP ID + BO ID combined).");
      return;
    }
    setSaving(true);
    try {
      const profile = await addInvestorProfile({
        pan,
        holderName,
        upiId,
        dematProvider,
        dematClientId,
      });
      posthog?.capture("investor_profile_add", { screen: "investors" });
      setProfiles((current) => [...current, profile]);
      setHolderName("");
      setPan("");
      setUpiId("");
      setDematProvider(null);
      setDematClientId("");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    await removeInvestorProfile(id);
    posthog?.capture("investor_profile_removed", { screen: "investors" });
    setProfiles((current) => current.filter((p) => p.id !== id));
  }

  function launchUpi(m: UpiMandate) {
    Linking.openURL(m.deepLink).catch(() => {
      Alert.alert(
        "No UPI app found",
        "Open this UPI ID in any UPI app on this phone to approve the mandate.",
      );
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <View style={styles.noteIcon}>
            <Ionicons name="people" size={20} color={colors.green} />
          </View>
          <View style={styles.noteBody}>
            <Text style={styles.noteTitle}>Apply for every family member</Text>
            <Text style={styles.noteText}>
              Save each person&apos;s PAN, demat and UPI ID once. When an IPO opens, generate a UPI mandate
              for that person and approve it in their own UPI app — no broker login needed.
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Add investor profile</Text>
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
          <Text style={styles.label}>UPI ID</Text>
          <TextInput
            style={styles.input}
            value={upiId}
            onChangeText={setUpiId}
            placeholder="9876543210@ybl"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>Demat provider</Text>
          <View style={styles.segment}>
            {(["CDSL", "NSDL"] as const).map((provider) => (
              <TouchableOpacity
                key={provider}
                style={[styles.segmentItem, dematProvider === provider && styles.segmentItemActive]}
                onPress={() => setDematProvider(provider)}
              >
                <Text style={[styles.segmentText, dematProvider === provider && styles.segmentTextActive]}>
                  {provider}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Demat client ID (full — DP ID + BO ID)</Text>
          <TextInput
            style={styles.input}
            value={dematClientId}
            onChangeText={setDematClientId}
            placeholder={dematProvider === "NSDL" ? "14 digits e.g. 12081600123456" : "16 digits e.g. 1208160012345678"}
            keyboardType="number-pad"
            maxLength={dematProvider === "NSDL" ? 14 : 16}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAdd} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save investor profile"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Saved investors</Text>
        {profiles.length === 0 ? (
          <Text style={styles.empty}>No investor profiles saved yet.</Text>
        ) : (
          profiles.map((profile) => (
            <View key={profile.id} style={styles.card}>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{profile.holderName || "Unnamed"}</Text>
                <Text style={styles.cardMeta}>
                  {profile.pan} · {profile.dematProvider ?? "—"} {profile.dematClientId}
                </Text>
                <Text style={styles.cardMeta}>{profile.upiId}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handleRemove(profile.id)}>
                  <Text style={styles.remove}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {mandate && (
          <View style={styles.mandateCard}>
            <Text style={styles.mandateTitle}>UPI mandate ready</Text>
            <Text style={styles.mandateAmount}>₹{mandate.amount.toLocaleString("en-IN")}</Text>
            <Text style={styles.mandateMeta}>{mandate.payeeName}</Text>
            <Text style={styles.mandateMeta}>{mandate.transactionNote}</Text>
            <View style={styles.qr}>
              <QRCode value={mandate.deepLink} size={180} color={colors.ink} backgroundColor="#FFFFFF" />
            </View>
            <Text style={styles.mandateHint}>
              Scan with {mandate.upiId.split("@")[1]}&apos;s UPI app, or tap below to open it on this phone.
            </Text>
            <TouchableOpacity style={styles.launchButton} onPress={() => launchUpi(mandate)}>
              <Text style={styles.launchButtonText}>Open in UPI app</Text>
            </TouchableOpacity>
          </View>
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
  formTitle: {
    fontSize: typography.title.fontSize,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: spacing.md,
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
  segment: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentItemActive: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.inkMuted,
  },
  segmentTextActive: {
    color: colors.green,
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
  sectionLabel: {
    fontSize: typography.label.fontSize,
    letterSpacing: typography.label.letterSpacing,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  empty: {
    textAlign: "center",
    color: colors.inkMuted,
    marginVertical: spacing.xl,
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
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  cardMeta: {
    fontSize: 12.5,
    color: colors.inkMuted,
    marginTop: 2,
  },
  cardActions: {
    marginLeft: spacing.md,
  },
  remove: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "600",
  },
  mandateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mandateTitle: {
    fontSize: typography.title.fontSize,
    fontWeight: "800",
    color: colors.ink,
  },
  mandateAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.green,
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  mandateMeta: {
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  qr: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
  },
  mandateHint: {
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  launchButton: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    marginTop: spacing.md,
  },
  launchButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});