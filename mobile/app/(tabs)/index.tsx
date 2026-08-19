import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchBoard } from "@/src/lib/api";
import type { BoardFilter, BoardIpo } from "@/src/lib/types";
import { effectiveSection, type StatusSection } from "@/src/lib/status";
import { IpoRow } from "@/src/components/IpoRow";
import { colors, radius, spacing, statusColor, typography } from "@/src/lib/theme";

const FILTERS: { label: string; value: BoardFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Mainboard", value: "MAINBOARD" },
  { label: "SME", value: "SME" },
];

const SECTION_ORDER: StatusSection[] = ["OPEN", "UPCOMING", "CLOSED", "LISTED"];

const SECTION_LABELS: Record<StatusSection, string> = {
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
    const now = Date.now();
    const byStatus: Record<StatusSection, BoardIpo[]> = { OPEN: [], UPCOMING: [], CLOSED: [], LISTED: [] };
    for (const ipo of ipos) {
      const section = effectiveSection(ipo, now);
      const list = byStatus[section];
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
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IpoRow ipo={item} onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: item.slug } })} />
          )}
          renderSectionHeader={({ section }) => {
            const color = colors[statusColor(section.status)];
            return (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: color }]} />
                <Text style={styles.sectionTitle}>{SECTION_LABELS[section.status]}</Text>
                <Text style={[styles.sectionCount, { color }]}>{section.data.length}</Text>
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
    backgroundColor: colors.paper,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },
  filterChipActive: {
    backgroundColor: colors.green,
    color: colors.white,
  },
  boardSummary: {
    fontSize: typography.caption.fontSize,
    color: colors.inkFaint,
    marginTop: 4,
    marginBottom: 2,
    marginHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.lg,
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
    color: colors.ink,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "800",
  },
  list: {
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  error: {
    color: colors.red,
    textAlign: "center",
  },
  empty: {
    textAlign: "center",
    color: colors.inkMuted,
    marginTop: 40,
  },
});