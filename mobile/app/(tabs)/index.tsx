import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchBoard } from "@/src/lib/api";
import type { BoardFilter, BoardIpo } from "@/src/lib/types";
import { IpoRow } from "@/src/components/IpoRow";

const FILTERS: { label: string; value: BoardFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Mainboard", value: "MAINBOARD" },
  { label: "SME", value: "SME" },
];

export default function BoardScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<BoardFilter>("ALL");
  const [ipos, setIpos] = useState<BoardIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setIpos(await fetchBoard(filter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the IPO board");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchBoard(filter)
      .then(setIpos)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load the IPO board"),
      )
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Text
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              {item.label}
            </Text>
          );
        })}
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0E6B3A" />
        </View>
      ) : (
        <FlatList
          data={ipos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IpoRow ipo={item} onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: item.slug } })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
          ListEmptyComponent={<Text style={styles.empty}>No IPOs match this filter right now.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF7F2",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },
  filterChipActive: {
    backgroundColor: "#0E6B3A",
    color: "#FFFFFF",
  },
  list: {
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  error: {
    color: "#B91C1C",
    textAlign: "center",
  },
  empty: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 40,
  },
});