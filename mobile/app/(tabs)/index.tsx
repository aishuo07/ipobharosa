import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchBoard } from "@/src/lib/api";
import type { BoardFilter, BoardIpo, IpoStatus } from "@/src/lib/types";
import { IpoRow, STATUS_META } from "@/src/components/IpoRow";

const FILTERS: { label: string; value: BoardFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Mainboard", value: "MAINBOARD" },
  { label: "SME", value: "SME" },
];

const SECTION_ORDER: IpoStatus[] = ["OPEN", "UPCOMING", "CLOSED", "LISTED"];

const SECTION_LABELS: Record<IpoStatus, string> = {
  OPEN: "Open now",
  UPCOMING: "Upcoming",
  CLOSED: "Closed",
  LISTED: "Listed",
};

function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

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

  const sections = useMemo(() => {
    const byStatus: Record<IpoStatus, BoardIpo[]> = { OPEN: [], UPCOMING: [], CLOSED: [], LISTED: [] };
    for (const ipo of ipos) {
      const list = byStatus[ipo.status];
      if (list) list.push(ipo);
    }
    for (const status of SECTION_ORDER) {
      const list = byStatus[status];
      list.sort((a, b) => {
        const key = (item: BoardIpo) =>
          status === "OPEN"
            ? item.closeDate || item.openDate
            : status === "LISTED"
              ? item.listingDate || item.closeDate
              : item.openDate || item.closeDate;
        return compareDates(key(a), key(b));
      });
    }
    return SECTION_ORDER.map((status) => ({
      status,
      data: byStatus[status],
    })).filter((section) => section.data.length > 0);
  }, [ipos]);

  const totalCount = sections.reduce((sum, s) => sum + s.data.length, 0);

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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IpoRow ipo={item} onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: item.slug } })} />
          )}
          renderSectionHeader={({ section }) => {
            const meta = STATUS_META[section.status];
            return (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: meta.color }]} />
                <Text style={styles.sectionTitle}>{SECTION_LABELS[section.status]}</Text>
                <Text style={[styles.sectionCount, { color: meta.color }]}>{section.data.length}</Text>
              </View>
            );
          }}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
          ListHeaderComponent={
            totalCount > 0 ? <Text style={styles.boardSummary}>{totalCount} IPOs · sorted by date</Text> : null
          }
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
  boardSummary: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 2,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1F2937",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "800",
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