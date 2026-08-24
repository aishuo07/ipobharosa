import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { fetchBoard } from "@/src/lib/api";
import { getCachedBoard, setCachedBoard } from "@/src/lib/cache";
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

function matchesSearch(ipo: BoardIpo, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    ipo.companyName.toLowerCase().includes(q) ||
    ipo.sector.toLowerCase().includes(q) ||
    ipo.registrar?.toLowerCase().includes(q) ||
    ipo.board.toLowerCase().includes(q)
  );
}

export default function BoardScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [filter, setFilter] = useState<BoardFilter>("ALL");
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInput>(null);
  const [ipos, setIpos] = useState<BoardIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await fetchBoard(filter);
      setIpos(data);
      await setCachedBoard(filter, data);
      if (isRefresh) posthog?.capture("board_refreshed", { board_filter: filter });
    } catch (cause) {
      const cached = await getCachedBoard(filter);
      if (cached && cached.length > 0) {
        setIpos(cached);
        setError(null);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not load the IPO board");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, posthog]);

  useEffect(() => {
    void (async () => {
      const cached = await getCachedBoard(filter);
      if (cached && cached.length > 0) {
        setIpos(cached);
        setLoading(false);
        void load(true);
      } else {
        void load(false);
      }
    })();
  }, [filter]);

  const filteredIpos = useMemo(() => {
    if (!search.trim()) return ipos;
    return ipos.filter((ipo) => matchesSearch(ipo, search));
  }, [ipos, search]);

  const sections = useMemo(() => {
    const now = Date.now();
    const byStatus: Record<StatusSection, BoardIpo[]> = { OPEN: [], UPCOMING: [], CLOSED: [], LISTED: [] };
    for (const ipo of filteredIpos) {
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
  }, [filteredIpos]);

  const totalCount = sections.reduce((sum, s) => sum + s.data.length, 0);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.inkFaint} style={styles.searchIcon} />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search IPOs..."
          placeholderTextColor={colors.inkFaint}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Text onPress={() => { setSearch(""); searchRef.current?.focus(); }} style={styles.searchClear}>
            ✕
          </Text>
        )}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Text
              key={item.value}
              onPress={() => {
                posthog?.capture("board_filter_selected", { board_filter: item.value });
                setFilter(item.value);
              }}
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
            <IpoRow
              ipo={item}
              onPress={() => {
                posthog?.capture("ipo_detail_opened", { ipo_slug: item.slug, ipo_board: item.board });
                router.push({ pathname: "/ipo/[slug]", params: { slug: item.slug } });
              }}
            />
          )}
          renderSectionHeader={({ section }) => {
            const color = colors[statusColor(section.status)];
            return (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: color }]} />
                <Text style={styles.sectionTitle}>{SECTION_LABELS[section.status]}</Text>
                <View style={[styles.sectionPill, { backgroundColor: color }]}>
                  <Text style={styles.sectionCount}>{section.data.length}</Text>
                </View>
              </View>
            );
          }}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
          ListHeaderComponent={
            totalCount > 0 ? (
              <Text style={styles.boardSummary}>
                {search ? `${totalCount} results` : `${totalCount} IPOs`} · sorted by date
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? `No IPOs match "${search}"` : "No IPOs match this filter right now."}
            </Text>
          }
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 16,
    color: colors.inkFaint,
    paddingLeft: spacing.sm,
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
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    paddingBottom: 8,
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
    flex: 1,
  },
  sectionPill: {
    minWidth: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
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
