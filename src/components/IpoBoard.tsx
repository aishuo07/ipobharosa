"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardIpo } from "@/lib/board-data";
import type { FilingRadarEntry } from "@/lib/discovery/filing-catalogue";
import {
  boardFilterLabel,
  boardFilterQuery,
  filterIposByBoard,
  filterIposByStatus,
  filterIposByVerification,
  type BoardFilter,
  type StatusFilter,
  type VerificationFilter,
} from "@/lib/board-filter";
import { Badge, SegmentedTabs, StatePanel, TabButton, TextInput } from "@/components/ui";
import { InstallApp } from "@/components/InstallApp";
import { calendarFeedUrl, googleCalendarSubscriptionUrl } from "@/lib/calendar";
import {
  calendarEventTimingLabel,
  chronologyAnchor,
  dateLedgerGroups,
  formatMarketDate,
  groupIposByChronology,
  lifecycleEventsByDay,
  marketMonthAnchor,
  marketDayKey,
  marketDayOffset,
  sortCalendarAgendaEvents,
  todayMarketSummary,
  type CatalogueSort,
  type IpoCalendarEvent,
} from "@/lib/ipo-chronology";
import {
  badgeText,
  confidenceLabel,
  countdownText,
  effectiveStatus,
  fmtCr,
  fmtDate,
  fmtDateTime,
  fmtDateShort,
  fmtINR,
  gmpPct,
  gmpAvailabilityText,
  gmpAvailabilityDetailText,
  gmpUpdatedText,
  isStale,
  lifecycleDoneUpTo,
  LIFECYCLE_STEPS,
  listingGainPct,
  registrarAllotmentUrl,
  subSummary,
  subscriptionAvailabilityText,
  timeUntil,
} from "@/lib/board-helpers";

const TAB_DEFS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All statuses" },
  { key: "OPEN", label: "Open Now" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "CLOSED", label: "Awaiting Allotment" },
  { key: "LISTED", label: "Listed" },
];

type DTab = "overview" | "financials" | "subscription" | "gmp" | "documents";
const DTABS: { key: DTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "subscription", label: "Subscription" },
  { key: "gmp", label: "GMP Trend" },
  { key: "documents", label: "Documents" },
];

type BoardUser = { email: string | null; name: string | null } | null;
type PublicView = "dates" | "board" | "catalogue" | "pipeline" | "calendar";

export default function IpoBoard({
  ipos,
  filings = [],
  user = null,
  watchlistedIds = [],
  initialNow,
  onSignOut,
}: {
  ipos: BoardIpo[];
  filings?: FilingRadarEntry[];
  user?: BoardUser;
  watchlistedIds?: string[];
  initialNow: number;
  onSignOut?: () => Promise<void>;
}) {
  const [tab, setTab] = useState<StatusFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dtab, setDtab] = useState<DTab>("overview");
  const [watching, setWatching] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(watchlistedIds.map((id) => [id, true])),
  );
  const [now, setNow] = useState(initialNow);
  const [query, setQuery] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [view, setView] = useState<PublicView>("dates");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("ALL");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("ALL");
  const [calMonth, setCalMonth] = useState(() => marketMonthAnchor(initialNow));
  const router = useRouter();

  const MAX_COMPARE = 3;
  const todayEventCount = useMemo(
    () => lifecycleEventsByDay(ipos)[marketDayKey(now)]?.length ?? 0,
    [ipos, now],
  );

  async function toggleWatch(ipoId: string) {
    if (!user) {
      router.push("/login");
      return;
    }
    const nextWatching = !watching[ipoId];
    setWatching((w) => ({ ...w, [ipoId]: nextWatching }));
    try {
      await fetch(`/api/watchlist/${ipoId}`, { method: nextWatching ? "POST" : "DELETE" });
    } catch {
      // Revert on network failure rather than leave the UI lying about state.
      setWatching((w) => ({ ...w, [ipoId]: !nextWatching }));
    }
  }

  function toggleCompare(ipoId: string) {
    setCompareIds((ids) => {
      if (ids.includes(ipoId)) return ids.filter((id) => id !== ipoId);
      if (ids.length >= MAX_COMPARE) return ids;
      return [...ids, ipoId];
    });
  }

  const boardIpos = useMemo(() => filterIposByBoard(ipos, boardFilter), [ipos, boardFilter]);
  const visibleBoardIpos = useMemo(
    () => filterIposByVerification(boardIpos, verificationFilter),
    [boardIpos, verificationFilter],
  );
  const boardCounts = useMemo(() => ({
    ALL: ipos.length,
    MAINBOARD: ipos.filter((ipo) => ipo.board === "MAINBOARD").length,
    SME: ipos.filter((ipo) => ipo.board === "SME").length,
  }), [ipos]);
  const compareList = useMemo(
    () => compareIds.map((id) => visibleBoardIpos.find((i) => i.id === id)).filter((i): i is BoardIpo => !!i),
    [compareIds, visibleBoardIpos],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const list = useMemo(() => {
    // A search query overrides the status tab entirely — someone typing a
    // company name wants to find it regardless of whether it's open,
    // upcoming, or already listed, not just within whatever tab happens
    // to be selected.
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      return visibleBoardIpos
        .filter(
          (i) => i.companyName.toLowerCase().includes(trimmed) || i.sector.toLowerCase().includes(trimmed),
        )
        .sort((a, b) => a.companyName.localeCompare(b.companyName));
    }

    const filtered = filterIposByStatus(visibleBoardIpos, tab);
    if (tab === "OPEN") {
      return [...filtered].sort(
        (a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime(),
      );
    }
    return filtered;
  }, [visibleBoardIpos, tab, query]);

  const selected = visibleBoardIpos.find((i) => i.id === selectedId) ?? null;
  const filingList = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return trimmed ? filings.filter((entry) => entry.companyName.toLowerCase().includes(trimmed)) : filings;
  }, [filings, query]);

  function selectCard(id: string) {
    const opening = selectedId !== id;
    setSelectedId(opening ? id : null);
    setDtab("overview");
  }

  function changeTab(key: StatusFilter) {
    setTab(key);
    setSelectedId(null);
  }

  function changeView(next: PublicView) {
    setView(next);
    setSelectedId(null);
    setQuery("");
  }

  function changeBoard(next: BoardFilter) {
    setBoardFilter(next);
    setSelectedId(null);
    setCompareIds([]);
    setShowCompare(false);
  }

  function changeVerification(next: VerificationFilter) {
    setVerificationFilter(next);
    setSelectedId(null);
    setCompareIds([]);
    setShowCompare(false);
  }

  return (
    <div className="wrap">
      <div className="masthead">
        <div className="masthead-top">
          <div className="brand">
            <span className="wordmark">IPOBharosa</span>
            <span className="eyebrow">Lot Size · GMP · Dates · Allotment</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <InstallApp />
            {user ? (
              <>
                <a href="/watchlist" className="btn btn-ghost" style={{ padding: "6px 12px" }}>
                  Watchlist
                </a>
                <span style={{ color: "var(--ink-faint)" }}>{user.email ?? user.name}</span>
                {onSignOut && (
                  <form action={onSignOut}>
                    <button type="submit" className="btn btn-ghost" style={{ padding: "6px 12px" }}>
                      Sign out
                    </button>
                  </form>
                )}
              </>
            ) : (
              <a href="/login" className="btn" style={{ padding: "6px 12px" }}>
                Sign in
              </a>
            )}
          </div>
        </div>
      </div>

      <section className="board-intro board-intro-compact" aria-labelledby="board-title">
        <div>
          <p className="board-kicker">Indian IPO tracker</p>
          <h1 id="board-title">Dates, demand and GMP—without the noise.</h1>
        </div>
        <p className="board-coverage">
          <strong>{ipos.length} IPOs</strong> with complete terms · {filings.length} official filings · market signals checked hourly
        </p>
      </section>

      <div className="controls">
        <SegmentedTabs label="View">
          <TabButton
            type="button"
            active={view === "dates"}
            onClick={() => changeView("dates")}
          >
            Today <span className="n">{todayEventCount}</span>
          </TabButton>
          <TabButton
            type="button"
            active={view === "board"}
            onClick={() => changeView("board")}
          >
            Live IPOs
          </TabButton>
          <TabButton
            type="button"
            active={view === "calendar"}
            onClick={() => changeView("calendar")}
          >
            Calendar
          </TabButton>
          <TabButton
            type="button"
            active={view === "catalogue"}
            onClick={() => changeView("catalogue")}
          >
            All IPOs <span className="n">{ipos.length}</span>
          </TabButton>
          {filings.length > 0 && (
            <TabButton
              type="button"
              active={view === "pipeline"}
              onClick={() => changeView("pipeline")}
            >
              IPO Pipeline <span className="n">{filings.length}</span>
            </TabButton>
          )}
        </SegmentedTabs>
        {(view === "dates" || view === "board" || view === "catalogue" || view === "calendar") && (
          <SegmentedTabs label="IPO type">
            {(["ALL", "MAINBOARD", "SME"] as const).map((filter) => (
              <TabButton
                key={filter}
                type="button"
                active={boardFilter === filter}
                onClick={() => changeBoard(filter)}
              >
                {boardFilterLabel(filter)} <span className="n">{boardCounts[filter]}</span>
              </TabButton>
            ))}
          </SegmentedTabs>
        )}
        {(view === "board" || view === "catalogue") && (
          <SegmentedTabs label="Data verification">
            {([
              ["ALL", "All data"],
              ["VERIFIED", "Verified"],
              ["PENDING", "Pending"],
              ["NEEDS_REVIEW", "Needs review"],
            ] as const).map(([filter, label]) => (
              <TabButton
                key={filter}
                type="button"
                active={verificationFilter === filter}
                onClick={() => changeVerification(filter)}
              >
                {label} <span className="n">{filterIposByVerification(boardIpos, filter).length}</span>
              </TabButton>
            ))}
          </SegmentedTabs>
        )}
        {(view === "board" || view === "catalogue" || view === "pipeline") && (
          <>
            {(view === "board" || view === "catalogue") && (
              <SegmentedTabs label="IPO status">
                {TAB_DEFS.map((t) => {
                  const count = filterIposByStatus(visibleBoardIpos, t.key).length;
                  return (
                    <TabButton
                      key={t.key}
                      type="button"
                      active={tab === t.key}
                      onClick={() => changeTab(t.key)}
                    >
                      {t.label} <span className="n">{count}</span>
                    </TabButton>
                  );
                })}
              </SegmentedTabs>
            )}
            <div className="search-wrap">
              <TextInput
                type="search"
                className="search-box"
                placeholder={view === "pipeline" ? "Search official filings" : "Search by company or sector"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search IPOs by company or sector"
              />
              {query && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="sort-note">
              {view === "pipeline"
                ? `${filingList.length} official filing${filingList.length !== 1 ? "s" : ""}`
                : view === "catalogue"
                  ? `${list.length} complete IPO${list.length !== 1 ? "s" : ""} in this view`
                : query
                ? `${list.length} result${list.length !== 1 ? "s" : ""} for "${query.trim()}"`
                : tab === "OPEN"
                  ? "Sorted by closing soonest"
                  : ""}
            </div>
          </>
        )}
      </div>

      {view === "dates" ? (
        <DateLedgerView
          ipos={boardIpos}
          boardFilter={boardFilter}
          now={now}
          onOpenCalendar={() => changeView("calendar")}
        />
      ) : view === "board" ? (
        <>
          <div className="board">
            {list.map((ipo) => (
              <Card
                key={ipo.id}
                ipo={ipo}
                now={now}
                selected={ipo.id === selectedId}
                onSelect={() => selectCard(ipo.id)}
                watching={!!watching[ipo.id]}
                onToggleWatch={() => toggleWatch(ipo.id)}
                comparing={compareIds.includes(ipo.id)}
                compareDisabled={!compareIds.includes(ipo.id) && compareIds.length >= MAX_COMPARE}
                onToggleCompare={() => toggleCompare(ipo.id)}
              />
            ))}
            {list.length === 0 && (
              <StatePanel title={query ? `No results for “${query.trim()}”` : "No IPOs here right now"}>
                {query
                  ? "Try a shorter company name or sector."
                  : boardFilter === "SME" && boardCounts.SME === 0
                    ? "No SME IPO has cleared official verification yet. Verified SME issues will appear automatically."
                    : "New verified listings will appear here automatically."}
              </StatePanel>
            )}
          </div>

          {compareList.length >= 2 && !showCompare && (
            <div className="compare-bar">
              <span className="compare-bar-names">
                Comparing {compareList.length}: {compareList.map((i) => i.companyName).join(" · ")}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={() => setShowCompare(true)}>
                  View comparison
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setCompareIds([])}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {showCompare && compareList.length >= 2 && (
            <div className="detail-wrap">
              <CompareTable
                ipos={compareList}
                now={now}
                onClose={() => setShowCompare(false)}
                onClear={() => {
                  setCompareIds([]);
                  setShowCompare(false);
                }}
              />
            </div>
          )}
        </>
      ) : view === "catalogue" ? (
        <IpoCatalogue
          ipos={list}
          now={now}
          watching={watching}
          onToggleWatch={toggleWatch}
          filingsCount={filings.length}
        />
      ) : view === "pipeline" ? (
        <FilingPipeline entries={filingList} />
      ) : (
        <CalendarView
          ipos={boardIpos}
          boardFilter={boardFilter}
          now={now}
          month={calMonth}
          onPrevMonth={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          onNextMonth={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        />
      )}

      {selected && (
        <div className="detail-wrap" id="detail-wrap">
          <DetailPanel
            ipo={selected}
            now={now}
            dtab={dtab}
            setDtab={setDtab}
            watching={!!watching[selected.id]}
            onToggleWatch={() => toggleWatch(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      <footer className="page-foot">
        IPOBharosa tracks real Indian IPOs. Grey market premium (GMP) is
        informal, unregulated dealer-street pricing gathered from multiple
        public sources — not a guarantee of listing price.
        <div className="page-foot-links">
          <a href="/methodology">Methodology</a>
          <a href="/disclaimer">Disclaimer</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </footer>
    </div>
  );
}

function DateLedgerView({
  ipos,
  boardFilter,
  now,
  onOpenCalendar,
}: {
  ipos: BoardIpo[];
  boardFilter: BoardFilter;
  now: number;
  onOpenCalendar: () => void;
}) {
  const [range, setRange] = useState<"WEEK" | "ALL">("WEEK");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const todayKey = marketDayKey(now);
  const groups = useMemo(
    () => dateLedgerGroups(ipos, now, range === "WEEK" ? 7 : null),
    [ipos, now, range],
  );
  const eventsByDay = useMemo(() => lifecycleEventsByDay(ipos), [ipos]);
  const stripDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => marketDayOffset(todayKey, index)),
    [todayKey],
  );
  const visibleGroups = selectedDay
    ? [{ dayKey: selectedDay, events: eventsByDay[selectedDay] ?? [] }]
    : groups;
  const openCount = ipos.filter((ipo) => {
    const status = effectiveStatus(ipo, now);
    return status === "open" || status === "closing-soon";
  }).length;
  const summary = useMemo(() => todayMarketSummary(ipos, now), [ipos, now]);
  const feedUrl = calendarFeedUrl(boardFilter);
  const todayCounts = [
    { key: "opens", count: summary.opens, label: summary.opens === 1 ? "opening" : "openings" },
    { key: "closes", count: summary.closes, label: summary.closes === 1 ? "closing" : "closings" },
    { key: "allotment", count: summary.allotments, label: summary.allotments === 1 ? "allotment" : "allotments" },
    { key: "lists", count: summary.listings, label: summary.listings === 1 ? "listing" : "listings" },
  ].filter((item) => item.count > 0);

  return (
    <section className="date-ledger" aria-labelledby="date-ledger-title">
      <header className="date-ledger-today">
        <div>
          <span>Today</span>
          <h2 id="date-ledger-title">{formatMarketDate(now, { weekday: "long", day: "numeric", month: "long" })}</h2>
        </div>
        <div className="today-market-counts" aria-label="Today IPO activity">
          <strong>{openCount} open for bidding</strong>
          {todayCounts.map((item) => (
            <span className={`today-count cal-${item.key}`} key={item.key}>
              {item.count} {item.label}
            </span>
          ))}
          {todayCounts.length === 0 && <span>No scheduled events today</span>}
        </div>
      </header>

      <div className="date-ledger-toolbar">
        <SegmentedTabs label="Date range">
          <TabButton active={range === "WEEK"} onClick={() => { setRange("WEEK"); setSelectedDay(null); }}>
            Next 7 days
          </TabButton>
          <TabButton active={range === "ALL"} onClick={() => { setRange("ALL"); setSelectedDay(null); }}>
            All upcoming
          </TabButton>
        </SegmentedTabs>
        <div className="date-ledger-actions">
          <a className="ui-button ui-button-secondary" href={feedUrl}>Add all dates</a>
          <button type="button" className="ui-button ui-button-secondary" onClick={onOpenCalendar}>Month calendar</button>
        </div>
      </div>

      <div className="date-strip" aria-label="Choose a date">
        {stripDays.map((dayKey, index) => {
          const eventCount = eventsByDay[dayKey]?.length ?? 0;
          return (
            <button
              type="button"
              key={dayKey}
              className={`date-strip-day${index === 0 ? " is-today" : ""}${selectedDay === dayKey ? " is-selected" : ""}`}
              aria-pressed={selectedDay === dayKey}
              onClick={() => setSelectedDay((current) => current === dayKey ? null : dayKey)}
            >
              <span>{index === 0 ? "Today" : formatMarketDate(`${dayKey}T12:00:00.000Z`, { weekday: "short" })}</span>
              <strong>{formatMarketDate(`${dayKey}T12:00:00.000Z`, { day: "numeric", month: "short" })}</strong>
              <small>{eventCount ? `${eventCount} ${eventCount === 1 ? "event" : "events"}` : "No events"}</small>
            </button>
          );
        })}
      </div>

      <div className="date-ledger-groups">
        {visibleGroups.map((group) => {
          const isToday = group.dayKey === todayKey;
          return (
            <section className={`date-ledger-group${isToday ? " is-today" : ""}`} key={group.dayKey} aria-labelledby={`ledger-${group.dayKey}`}>
              {isToday ? (
                <h3 className="sr-only" id={`ledger-${group.dayKey}`}>Today&apos;s IPO events</h3>
              ) : (
                <header className="date-ledger-group-head">
                  <div>
                    <span>{formatMarketDate(`${group.dayKey}T12:00:00.000Z`, { weekday: "long" })}</span>
                    <h3 id={`ledger-${group.dayKey}`}>
                      {formatMarketDate(`${group.dayKey}T12:00:00.000Z`, { day: "numeric", month: "long", year: "numeric" })}
                    </h3>
                  </div>
                  <strong>{group.events.length} event{group.events.length === 1 ? "" : "s"}</strong>
                </header>
              )}

              {group.events.length === 0 ? (
                <div className="date-ledger-empty">
                  <strong>No IPO event {isToday ? "today" : "on this date"}.</strong>
                  <span>{isToday && openCount > 0 ? `${openCount} IPO${openCount === 1 ? " is" : "s are"} still accepting bids.` : "Choose another date or view all upcoming events."}</span>
                </div>
              ) : (
                <div className="date-ledger-table-wrap">
                  <table className="date-ledger-table">
                    <thead>
                      <tr>
                        <th>IPO</th>
                        <th>Event</th>
                        <th>Price & minimum</th>
                        <th>GMP · unofficial</th>
                        <th>Demand</th>
                        <th><span className="sr-only">Action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.events.map((event) => (
                        <DateLedgerRow event={event} now={now} key={`${event.ipo.id}-${event.type}-${event.dayKey}`} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function DateLedgerRow({ event, now }: { event: IpoCalendarEvent<BoardIpo>; now: number }) {
  const { ipo } = event;
  const allotmentUrl = event.type === "allotment" ? registrarAllotmentUrl(ipo.registrar) : null;
  const gmp = ipo.gmp;
  const eventLabel = event.type === "lists" ? "Listing" : event.label;
  return (
    <tr>
      <td data-label="IPO" className="date-ledger-company">
        <a href={`/ipo/${ipo.slug}`}>{ipo.companyName}</a>
        <div><span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span><VerificationBadge ipo={ipo} /></div>
      </td>
      <td data-label="Event" className="date-ledger-event-cell">
        <span className={`date-event-pill cal-${event.type}`}>{eventLabel}</span>
        <small>{calendarEventTimingLabel(event, now)}</small>
      </td>
      <td data-label="Price & minimum" className="date-ledger-price">
        <strong>₹{ipo.priceBandLow}–₹{ipo.priceBandHigh}</strong>
        <small>{ipo.lotSize} shares · {fmtINR(ipo.lotSize * ipo.priceBandHigh)}</small>
      </td>
      <td data-label="GMP · unofficial" className="date-ledger-gmp">
        {gmp ? <><strong>{fmtINR(gmp.medianValue)} ({gmpPct(ipo)}%)</strong><small>{confidenceLabel(gmp.confidence)} · {gmpUpdatedText(gmp.capturedAt, now)}</small></> : <><strong>{gmpAvailabilityText(ipo)}</strong><small>{gmpAvailabilityDetailText(ipo)}</small></>}
      </td>
      <td data-label="Demand" className="date-ledger-demand">
        <strong>{subSummary(ipo)}</strong>
        <small>{subscriptionAvailabilityText(ipo)}</small>
      </td>
      <td data-label="Action" className="date-ledger-row-actions">
        {allotmentUrl && (
          <a className="ui-button ui-button-primary" href={allotmentUrl} target="_blank" rel="noopener noreferrer">Check allotment</a>
        )}
        <a className={`ui-button ${allotmentUrl ? "ui-button-secondary" : "ui-button-primary"}`} href={`/ipo/${ipo.slug}`}>View IPO details</a>
      </td>
    </tr>
  );
}

function IpoCatalogue({
  ipos,
  now,
  watching,
  onToggleWatch,
  filingsCount,
}: {
  ipos: BoardIpo[];
  now: number;
  watching: Record<string, boolean>;
  onToggleWatch: (ipoId: string) => void;
  filingsCount: number;
}) {
  const [sort, setSort] = useState<CatalogueSort>("NEXT_EVENT");
  const groups = useMemo(() => groupIposByChronology(ipos, now, sort), [ipos, now, sort]);

  return (
    <section className="ipo-catalogue" aria-labelledby="ipo-catalogue-title">
      <div className="catalogue-intro">
        <div>
          <p className="board-kicker">Complete issue terms</p>
          <h2 id="ipo-catalogue-title">All IPOs, in date order.</h2>
          <p>
            These issues have enough public terms to compare. Verification labels tell you whether
            official checks passed, are retrying, or need review.
          </p>
        </div>
        <label className="catalogue-sort">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as CatalogueSort)}>
            <option value="NEXT_EVENT">Next important date</option>
            <option value="OPEN_ASC">Opening date · earliest</option>
            <option value="OPEN_DESC">Opening date · latest</option>
          </select>
        </label>
      </div>
      <div className="catalogue-boundary" role="note">
        <strong>{ipos.length} complete IPOs in this view.</strong>{" "}
        Early DRHP/RHP filings without final price, lot or dates stay in IPO Pipeline ({filingsCount})—missing facts are never shown as zero.
      </div>

      {groups.map((group) => (
        <section className="catalogue-day" key={group.dayKey} aria-labelledby={`catalogue-${group.dayKey}`}>
          <header className="catalogue-day-head">
            <time id={`catalogue-${group.dayKey}`} dateTime={group.dayKey}>{fmtDate(group.event.iso)}</time>
            <span>{group.ipos.length} IPO{group.ipos.length === 1 ? "" : "s"}</span>
          </header>
          <div className="catalogue-rows">
            {group.ipos.map((ipo) => (
              <CatalogueRow
                key={ipo.id}
                ipo={ipo}
                now={now}
                watching={!!watching[ipo.id]}
                onToggleWatch={() => onToggleWatch(ipo.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {ipos.length === 0 && (
        <StatePanel title="No complete IPOs match these filters">
          Try another status or verification filter. Early filings remain available in IPO Pipeline.
        </StatePanel>
      )}
    </section>
  );
}

function CatalogueRow({
  ipo,
  now,
  watching,
  onToggleWatch,
  event,
}: {
  ipo: BoardIpo;
  now: number;
  watching?: boolean;
  onToggleWatch?: () => void;
  event?: IpoCalendarEvent<BoardIpo>;
}) {
  const status = effectiveStatus(ipo, now);
  const anchor = event ?? chronologyAnchor(ipo, now);
  return (
    <article className="catalogue-row">
      <div className="catalogue-company">
        <div className="catalogue-row-badges">
          <span className={`badge badge-${status}`}>{badgeText(status)}</span>
          <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
          <VerificationBadge ipo={ipo} />
        </div>
        <a className="catalogue-company-link" href={`/ipo/${ipo.slug}`}>{ipo.companyName}</a>
        <span>{ipo.sector}</span>
        <p className="catalogue-anchor">
          <strong>{anchor.label}</strong> {fmtDate(anchor.iso)}
        </p>
      </div>
      <div className="catalogue-dates" aria-label={`${ipo.companyName} dates`}>
        <span><b>Open</b>{fmtDateShort(ipo.openDate)}</span>
        <span><b>Close</b>{fmtDateShort(ipo.closeDate)}</span>
        <span><b>Allotment</b>{fmtDateShort(ipo.allotmentDate)}</span>
        <span><b>Listing</b>{fmtDateShort(ipo.listingDate)}</span>
      </div>
      <MajorIpoFacts ipo={ipo} now={now} />
      <div className="catalogue-actions">
        <a className="ui-button ui-button-primary" href={`/ipo/${ipo.slug}`}>Full details & sources</a>
        <a className="ui-button ui-button-secondary" href={`/api/calendar?ipo=${ipo.slug}`}>Add dates (.ics)</a>
        {onToggleWatch && (
          <button
            type="button"
            className="ui-button ui-button-secondary"
            aria-pressed={watching}
            onClick={onToggleWatch}
          >
            {watching ? "★ Watching" : "☆ Watchlist"}
          </button>
        )}
      </div>
    </article>
  );
}

function MajorIpoFacts({ ipo, now }: { ipo: BoardIpo; now: number }) {
  const gain = listingGainPct(ipo);
  const gmpValue = ipo.status === "LISTED" && gain !== null
    ? `${gain >= 0 ? "+" : ""}${gain.toFixed(1)}% debut`
    : ipo.gmp ? `${fmtINR(ipo.gmp.medianValue)} (+${gmpPct(ipo)}%)` : gmpAvailabilityText(ipo);
  const gmpContext = ipo.status === "LISTED"
    ? "Listing performance"
    : ipo.gmp
      ? `${isStale(ipo.gmp.capturedAt, now) ? "Stale · " : ""}${gmpUpdatedText(ipo.gmp.capturedAt, now)} · ${ipo.gmp.sourceCount} source${ipo.gmp.sourceCount === 1 ? "" : "s"}`
      : gmpAvailabilityDetailText(ipo);
  return (
    <dl className="catalogue-facts">
      <div><dt>Price</dt><dd>₹{ipo.priceBandLow}–₹{ipo.priceBandHigh}</dd></div>
      <div><dt>Lot / minimum</dt><dd>{ipo.lotSize} · {fmtINR(ipo.lotSize * ipo.priceBandHigh)}</dd></div>
      <div><dt>Issue size</dt><dd>{fmtCr(ipo.issueSizeCr)}</dd></div>
      <div className="catalogue-gmp"><dt>{ipo.status === "LISTED" ? "Listed" : "GMP · unofficial"}</dt><dd>{gmpValue}<small>{gmpContext}</small></dd></div>
      <div className="catalogue-demand"><dt>Demand</dt><dd>{subSummary(ipo)}</dd></div>
    </dl>
  );
}

function FilingPipeline({ entries }: { entries: FilingRadarEntry[] }) {
  const rhpCount = entries.filter((entry) => entry.stage === "RHP_FILED").length;
  const drhpCount = entries.length - rhpCount;
  const linkedCount = entries.filter((entry) => entry.linkedIpo).length;
  return (
    <section className="filing-pipeline" aria-labelledby="filing-pipeline-title">
      <div className="pipeline-explainer">
        <div>
          <p className="board-kicker">Official market pipeline</p>
          <h2 id="filing-pipeline-title">Filed with SEBI, before applications open.</h2>
        </div>
        <p>
          These companies have an official DRHP or RHP filing. Final price, lot size and dates appear
          on the main board only after exchange verification—missing terms are never shown as zero.
        </p>
      </div>
      <div className="pipeline-summary" aria-label="Official filing pipeline summary">
        <div><strong>{entries.length}</strong><span>Official issuers</span></div>
        <div><strong>{rhpCount}</strong><span>RHP filed</span></div>
        <div><strong>{drhpCount}</strong><span>DRHP filed</span></div>
        <div><strong>{linkedCount}</strong><span>Linked to board</span></div>
      </div>
      <div className="filing-grid">
        {entries.map((entry) => {
          const trustTone = entry.linkedIpo?.verificationState === "VERIFIED"
            ? "positive"
            : entry.linkedIpo?.verificationState === "NEEDS_REVIEW" ? "critical" : entry.linkedIpo ? "warning" : "info";
          const trustLabel = entry.linkedIpo?.verificationState === "VERIFIED"
            ? "Available on board"
            : entry.linkedIpo?.verificationLabel ?? "Filing only";
          return <article className="filing-card" key={entry.id}>
            <div className="filing-card-top">
              <span className={`badge ${entry.stage === "RHP_FILED" ? "badge-open" : "badge-upcoming"}`}>
                {entry.stage === "RHP_FILED" ? "RHP filed" : "DRHP filed"}
              </span>
              <Badge tone={trustTone}>{trustLabel}</Badge>
            </div>
            <h3>{entry.companyName}</h3>
            <p className="filing-date">
              Filed {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(entry.filingDate))}
            </p>
            <div className="filing-awaiting">
              <span>Application terms</span>
              <strong>{entry.linkedIpo ? entry.linkedIpo.verificationLabel : "Awaiting exchange announcement"}</strong>
            </div>
            <div className="filing-links">
              {entry.linkedIpo && <a href={`/ipo/${entry.linkedIpo.slug}`}>View IPOBharosa details →</a>}
              <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">View SEBI filing ↗</a>
              {entry.documentUrl && <a href={entry.documentUrl} target="_blank" rel="noopener noreferrer">Open document ↗</a>}
            </div>
          </article>;
        })}
      </div>
      {entries.length === 0 && (
        <StatePanel title="Official filing feed is temporarily unavailable">
          The application-ready board remains available. The next ingestion run will retry SEBI automatically.
        </StatePanel>
      )}
    </section>
  );
}

function Card({
  ipo,
  now,
  selected,
  onSelect,
  watching,
  onToggleWatch,
  comparing,
  compareDisabled,
  onToggleCompare,
}: {
  ipo: BoardIpo;
  now: number;
  selected: boolean;
  onSelect: () => void;
  watching: boolean;
  onToggleWatch: () => void;
  comparing: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
}) {
  const es = effectiveStatus(ipo, now);
  const min = fmtINR(ipo.lotSize * ipo.priceBandHigh);
  let footRight: React.ReactNode = null;
  if (ipo.status === "OPEN") {
    footRight = (
      <span className={es === "closing-soon" ? "pill-time" : ""}>
        {countdownText(ipo, now)}
      </span>
    );
  } else if (ipo.status === "UPCOMING") {
    footRight = `Opens ${fmtDateShort(ipo.openDate)}`;
  } else if (es === "closed") {
    footRight = `Allotment ${fmtDateShort(ipo.allotmentDate)}`;
  } else {
    footRight = `Listed ${fmtDateShort(ipo.listingDate)}`;
  }

  const gainPct = listingGainPct(ipo);
  const gmpBlock =
    es.startsWith("listed-") && gainPct !== null ? (
      <span className={"gmp-value " + (gainPct >= 0 ? "up" : "down")}>
        {gainPct >= 0 ? "+" : ""}
        {gainPct.toFixed(1)}% on debut
      </span>
    ) : ipo.gmp ? (
      <span className="gmp-value up">
        {fmtINR(ipo.gmp.medianValue)}{" "}
        <span style={{ fontSize: 11, fontWeight: 600 }}>(+{gmpPct(ipo)}%)</span>
      </span>
    ) : (
      <span className="gmp-value" style={{ color: "var(--ink-faint)" }}>
        Not yet available
      </span>
    );

  const gmpLabel =
    es.startsWith("listed-") ? (
      "Listing gain"
    ) : (
      <abbr title="Grey Market Premium — unofficial, unregulated dealer-street pricing. Not exchange-verified.">
        GMP · unofficial
      </abbr>
    );

  return (
    <article className={"card status-" + es + (selected ? " selected" : "")}>
      <div className="card-top">
        <span className={"badge badge-" + es}>{badgeText(es)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
          <button
            type="button"
            className="card-watch-btn"
            aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
            aria-pressed={watching}
            onClick={onToggleWatch}
          >
            {watching ? "★" : "☆"}
          </button>
        </div>
      </div>
      <div className={`verification-line verification-${ipo.verification.state.toLowerCase()}`}>
        <VerificationBadge ipo={ipo} />
        <span>{ipo.verification.issueSummary ?? ipo.verification.description}</span>
      </div>
      <div>
        <a className="card-name card-name-link" href={`/ipo/${ipo.slug}`}>{ipo.companyName}</a>
        <div className="card-sector">{ipo.sector}</div>
      </div>
      <div className="card-stats">
        <div>
          <div className="stat-k">Price band</div>
          <div className="stat-v">
            ₹{ipo.priceBandLow}–{ipo.priceBandHigh}
          </div>
        </div>
        <div>
          <div className="stat-k">Lot size</div>
          <div className="stat-v">{ipo.lotSize} sh</div>
        </div>
        <div>
          <div className="stat-k">Min. investment</div>
          <div className="stat-v">{min}</div>
        </div>
        <div>
          <div className="stat-k">Issue size</div>
          <div className="stat-v">{fmtCr(ipo.issueSizeCr)}</div>
        </div>
      </div>
      <div className="card-gmp">
        <span className="gmp-label">{gmpLabel}</span>
        {gmpBlock}
      </div>
      {ipo.status !== "LISTED" && ipo.gmp && (
        <div className="gmp-meta" title={`Median of ${ipo.gmp.sourceCount} independent source${ipo.gmp.sourceCount !== 1 ? "s" : ""}, ±₹${ipo.gmp.maxDeviation.toFixed(0)} spread`}>
          {isStale(ipo.gmp.capturedAt, now) && <span className="stale-flag">Stale · </span>}
          {gmpUpdatedText(ipo.gmp.capturedAt, now)} · {ipo.gmp.sourceCount} source{ipo.gmp.sourceCount !== 1 ? "s" : ""} · {confidenceLabel(ipo.gmp.confidence)}
        </div>
      )}
      <div className="card-foot">
        <span>{subSummary(ipo)}</span>
        {footRight}
      </div>
      <label
        className={"card-compare" + (compareDisabled ? " disabled" : "")}
        title={compareDisabled ? "Compare up to 3 IPOs at a time" : undefined}
      >
        <input
          type="checkbox"
          checked={comparing}
          disabled={compareDisabled}
          onChange={onToggleCompare}
        />
        Compare
      </label>
      <button type="button" className="card-quick-view" onClick={onSelect} aria-expanded={selected}>
        {selected ? "Close quick view" : "Quick view"}
      </button>
    </article>
  );
}

function DetailPanel({
  ipo,
  now,
  dtab,
  setDtab,
  watching,
  onToggleWatch,
  onClose,
}: {
  ipo: BoardIpo;
  now: number;
  dtab: DTab;
  setDtab: (d: DTab) => void;
  watching: boolean;
  onToggleWatch: () => void;
  onClose: () => void;
}) {
  const es = effectiveStatus(ipo, now);
  const countdown =
    ipo.status === "OPEN" ? (
      <span className={"badge " + (es === "closing-soon" ? "badge-closing-soon" : "badge-open")}>
        {countdownText(ipo, now)}
      </span>
    ) : null;

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-title-row">
            <span className={"badge badge-" + es}>{badgeText(es)}</span>
            {countdown}
            <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
          </div>
          <div className="detail-name">{ipo.companyName}</div>
          <div className="detail-meta">
            {ipo.sector} · Registrar: {ipo.registrar ?? "Not available yet"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href={`/ipo/${ipo.slug}`} className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Permalink ↗
          </a>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close details">
            ✕ Close
          </button>
        </div>
      </div>

      <VerificationNotice ipo={ipo} />

      <div className="dtabs" role="tablist">
        {DTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"dtab" + (dtab === t.key ? " active" : "")}
            onClick={() => setDtab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dpanel">
        {dtab === "overview" && (
          <OverviewPanel ipo={ipo} now={now} watching={watching} onToggleWatch={onToggleWatch} />
        )}
        {dtab === "financials" && <FinancialsPanel ipo={ipo} />}
        {dtab === "subscription" && <SubscriptionPanel ipo={ipo} />}
        {dtab === "gmp" && <GmpPanel ipo={ipo} now={now} />}
        {dtab === "documents" && <DocumentsPanel ipo={ipo} />}
      </div>
    </div>
  );
}

function VerificationBadge({ ipo }: { ipo: BoardIpo }) {
  const tone = ipo.verification.state === "VERIFIED"
    ? "positive"
    : ipo.verification.state === "PENDING" ? "warning" : "critical";
  return <Badge tone={tone}>{ipo.verification.shortLabel}</Badge>;
}

export function VerificationNotice({ ipo }: { ipo: BoardIpo }) {
  return (
    <div className={`verification-notice verification-${ipo.verification.state.toLowerCase()}`} role="status">
      <VerificationBadge ipo={ipo} />
      <div>
        <strong>{ipo.verification.label}</strong>
        {ipo.verification.coverageLabel && <span className="verification-coverage">{ipo.verification.coverageLabel}</span>}
        <p>{ipo.verification.issueSummary ?? ipo.verification.description}</p>
        {(ipo.verification.providers?.length ?? 0) > 0 && <div className="verification-providers" aria-label="Official providers checked">
          {ipo.verification.providers?.map((provider) => <span key={provider}>{provider}</span>)}
        </div>}
        {ipo.verification.checkedAt && <small>Last checked {fmtDateTime(ipo.verification.checkedAt)}</small>}
        {ipo.verification.nextCheckAt && <small>Next check {fmtDateTime(ipo.verification.nextCheckAt)}</small>}
      </div>
    </div>
  );
}

export function OverviewPanel({
  ipo,
  now,
  watching,
  onToggleWatch,
}: {
  ipo: BoardIpo;
  now: number;
  watching: boolean;
  onToggleWatch?: () => void;
}) {
  const doneUpTo = lifecycleDoneUpTo(ipo);
  const nextIndex = doneUpTo + 1;
  const gainPct = listingGainPct(ipo);

  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-k">Price band</div>
          <div className="stat-v">
            ₹{ipo.priceBandLow} – ₹{ipo.priceBandHigh}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-k">Lot size</div>
          <div className="stat-v">{ipo.lotSize} shares</div>
        </div>
        <div className="stat-tile">
          <div className="stat-k">Min. investment</div>
          <div className="stat-v">{fmtINR(ipo.lotSize * ipo.priceBandHigh)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-k">Fresh issue / OFS</div>
          <div className="stat-v">
            {ipo.freshIssueCr !== null ? fmtCr(ipo.freshIssueCr) : "—"} /{" "}
            {ipo.ofsCr !== null ? fmtCr(ipo.ofsCr) : "—"}
          </div>
        </div>
        {ipo.status === "LISTED" && gainPct !== null && (
          <div className="stat-tile">
            <div className="stat-k">Listing price</div>
            <div className={"stat-v " + (gainPct >= 0 ? "up" : "down")}>
              ₹{ipo.listingPrice}{" "}
              <span className="stat-sub">
                ({gainPct >= 0 ? "+" : ""}
                {gainPct.toFixed(1)}% vs cap)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="lifecycle">
        {LIFECYCLE_STEPS.map((step, i) => {
          const dateVal = ipo[step.dateKey] as string;
          const stepState = i <= doneUpTo ? "done" : i === nextIndex ? "current" : "upcoming";
          return (
            <div className={"lc-step lc-" + stepState} key={step.key}>
              {i > 0 && (
                <div className={"lc-line" + (i <= nextIndex ? " lc-line-done" : "")} />
              )}
              <div className="lc-dot" />
              <div className="lc-label">{step.label}</div>
              <div className="lc-date">{fmtDateShort(dateVal)}</div>
              {stepState === "current" && <div className="lc-eta">{timeUntil(dateVal, now)}</div>}
            </div>
          );
        })}
      </div>
      <details className="src-detail" style={{ marginBottom: 18 }}>
        <summary>Full dates</summary>
        <div className="table-wrap">
          <table className="dates">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opens</td>
                <td>{fmtDate(ipo.openDate)}</td>
              </tr>
              <tr>
                <td>Closes</td>
                <td>{fmtDate(ipo.closeDate)}</td>
              </tr>
              <tr>
                <td>Allotment finalised</td>
                <td>{fmtDate(ipo.allotmentDate)}</td>
              </tr>
              <tr>
                <td>Refund initiated</td>
                <td>{fmtDate(ipo.refundDate)}</td>
              </tr>
              <tr>
                <td>Listing date</td>
                <td>{fmtDate(ipo.listingDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {ipo.status === "LISTED" ? (
        <>
          <p className="section-label" style={{ marginTop: 0 }}>
            Grey market signal, ahead of listing
          </p>
          {ipo.gmp && (
            <p style={{ margin: "0 0 18px", fontSize: 13.5 }}>
              Grey market showed{" "}
              <b style={{ fontFamily: "var(--font-mono)" }}>{fmtINR(ipo.gmp.medianValue)}</b> just
              before listing — unofficial, and not what actually predicted the debut.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="section-label" style={{ marginTop: 0 }}>
            Grey market premium (
            <abbr title="Grey Market Premium — an unofficial, unregulated price at which IPO shares trade before listing">
              GMP
            </abbr>
            )
          </p>
          {ipo.gmp ? (
            <div className="gmp-summary">
              <div className="gmp-summary-value">
                {fmtINR(ipo.gmp.medianValue)} <span className="pct">+{gmpPct(ipo)}% implied</span>
              </div>
              <div className="gmp-summary-meta">
                {isStale(ipo.gmp.capturedAt, now) && <span className="stale-flag">Stale · </span>}
                Updated {gmpUpdatedText(ipo.gmp.capturedAt, now)} · Median of {ipo.gmp.sourceCount}{" "}
                source{ipo.gmp.sourceCount !== 1 ? "s" : ""} ·{" "}
                {confidenceLabel(ipo.gmp.confidence)}
              </div>
              <p className="gmp-summary-disclaimer">
                Unofficial and not indicative of listing performance. See the GMP Trend tab for the
                full history.
              </p>
            </div>
          ) : (
            <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
              {gmpAvailabilityText(ipo)} — {gmpAvailabilityDetailText(ipo)}.
            </p>
          )}
        </>
      )}

      <div className="detail-cta" style={{ marginTop: 20 }}>
        {ipo.status === "CLOSED" &&
          (() => {
            const url = registrarAllotmentUrl(ipo.registrar);
            return url ? (
              <a
                className="btn btn-primary"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", display: "inline-block" }}
              >
                Check allotment status on {ipo.registrar} ↗
              </a>
            ) : (
              <span className="btn" style={{ color: "var(--ink-faint)", cursor: "default" }}>
                Registrar link not available — check {ipo.registrar ?? "your registrar"} directly
              </span>
            );
          })()}
        {onToggleWatch ? (
          <button
            className={"btn" + (watching ? " watching" : "")}
            type="button"
            onClick={onToggleWatch}
          >
            {watching ? "✓ Watching" : "+ Watchlist"}
          </button>
        ) : (
          <a className="btn" href="/login" style={{ textDecoration: "none", display: "inline-block" }}>
            Sign in to add to watchlist
          </a>
        )}
      </div>
    </>
  );
}

export function SubscriptionPanel({ ipo }: { ipo: BoardIpo }) {
  const s = ipo.subscription;
  if (!s || s.qibX === null || s.niiX === null || s.retailX === null) {
    return (
      <StatePanel title="Subscription data is not available yet">
        Bidding hasn&apos;t opened yet, or no subscription data has been captured for this IPO —
        it will appear here once the ingestion pipeline picks it up.
      </StatePanel>
    );
  }
  const cats: { key: string; label: string; title: string; value: number; color: string }[] = [
    { key: "qib", label: "QIB", title: "Qualified Institutional Buyers", value: s.qibX, color: "var(--cat-qib)" },
    { key: "nii", label: "NII", title: "Non-Institutional Investors (HNI)", value: s.niiX, color: "var(--cat-nii)" },
    { key: "retail", label: "Retail", title: "Retail Individual Investors", value: s.retailX, color: "var(--cat-retail)" },
  ];
  if (s.employeeX !== null) {
    cats.push({ key: "employee", label: "Employee", title: "Employee reservation", value: s.employeeX, color: "var(--cat-employee)" });
  }
  const categoryAverage = cats.reduce((sum, c) => sum + c.value, 0) / cats.length;
  const overall = s.totalX ?? categoryAverage;
  const maxScale = 20;

  return (
    <>
      <div className="sub-overall">
        <span className="big">{overall.toFixed(1)}x</span>
        <span className="lbl">{s.totalX !== null && s.totalX !== undefined ? "overall subscription" : "category average · official total unavailable"}</span>
      </div>
      <p className="section-label">By category</p>
      {cats.map((c) => (
        <div className="sub-row" key={c.key}>
          <div className="sub-cat">
            <abbr title={c.title}>{c.label}</abbr>
          </div>
          <div className="sub-track">
            <div
              className="sub-fill"
              style={{ width: `${Math.min(100, (c.value / maxScale) * 100)}%`, background: c.color }}
            />
          </div>
          <div className="sub-val">{c.value.toFixed(1)}x</div>
        </div>
      ))}
      <p className="subscription-source">
        Source: <a href={s.sourceUrl ?? ipo.provenance.subscription?.url ?? "#"} target="_blank" rel="noopener noreferrer">{s.sourceName ?? ipo.provenance.subscription?.name ?? "captured subscription table"} ↗</a>
        {" · "}Captured {fmtDateTime(s.capturedAt)}
      </p>
    </>
  );
}

export function GmpPanel({ ipo, now }: { ipo: BoardIpo; now: number }) {
  if (!ipo.gmp) {
    return (
      <StatePanel title={gmpAvailabilityText(ipo)}>
        {gmpAvailabilityDetailText(ipo)}. GMP is unofficial and is never inferred when a source
        has not published a quote.
      </StatePanel>
    );
  }
  return (
    <>
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-value">
            {fmtINR(ipo.gmp.medianValue)}
            <span className="pct">+{gmpPct(ipo)}% over cap</span>
          </span>
          <span className="chart-src">
            {isStale(ipo.gmp.capturedAt, now) && <span className="stale-flag">Stale · </span>}
            Updated {gmpUpdatedText(ipo.gmp.capturedAt, now)} · median of {ipo.gmp.sourceCount} source
            {ipo.gmp.sourceCount !== 1 ? "s" : ""} ·{" "}
            {confidenceLabel(ipo.gmp.confidence)}
          </span>
        </div>
        {ipo.gmpHistory.length >= 2 ? (
          <GmpTrendChart points={ipo.gmpHistory} />
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: "8px 0 0" }}>
            Trend chart appears once the pipeline has collected enough history for this IPO.
          </p>
        )}
      </div>
      <p className="disclaimer">
        GMP is informal, unregulated grey-market pricing gathered from multiple public sources
        outside any exchange. It reflects sentiment, not a guarantee of where the stock will list.
      </p>
    </>
  );
}

function GmpTrendChart({ points }: { points: { value: number; capturedAt: string }[] }) {
  const W = 560;
  const H = 130;
  const padTop = 14;
  const padBottom = 22;
  const padL = 6;
  const padR = 6;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = W - padL - padR;
  const innerH = H - padTop - padBottom;
  const stepX = innerW / (points.length - 1);
  const pts = points.map((p, i) => [
    padL + i * stepX,
    padTop + innerH - ((p.value - min) / range) * innerH,
    p.value,
  ]);
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath =
    linePath +
    ` L${pts[pts.length - 1][0].toFixed(1)},${padTop + innerH} L${pts[0][0].toFixed(1)},${padTop + innerH} Z`;
  const last = pts[pts.length - 1];
  const first = points[0];

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`GMP trend over ${points.length} data points, ending at ₹${last[2]}`}
        preserveAspectRatio="none"
      >
        <path d={areaPath} fill="var(--accent)" fillOpacity={0.14} stroke="none" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={i === pts.length - 1 ? 4 : 2}
            fill={i === pts.length - 1 ? "var(--accent)" : "var(--surface-2)"}
            stroke="var(--accent)"
            strokeWidth={1}
            aria-label={`${fmtDateShort(points[i].capturedAt)} — ₹${p[2]}`}
          />
        ))}
        <text
          x={last[0]}
          y={last[1] - 10}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize={12}
          fontWeight={700}
          fill="var(--accent)"
        >
          ₹{last[2]}
        </text>
        <text x={padL} y={H - 4} fontFamily="var(--font-mono)" fontSize={10} fill="var(--ink-faint)">
          {fmtDateShort(first.capturedAt)}
        </text>
        <text
          x={W - padR}
          y={H - 4}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize={10}
          fill="var(--ink-faint)"
        >
          Today
        </text>
      </svg>
    </div>
  );
}

function FinancialsContent({ financials }: { financials: BoardIpo["financials"] }) {
  // Data arrives most-recent-year-first; charts/tables read left-to-right oldest-to-newest.
  const years = [...financials].reverse();
  const latest = years[years.length - 1];
  const maxRevenue = Math.max(...years.map((y) => y.revenueCr ?? 0));

  return (
    <>
      <p className="section-label" style={{ marginTop: 0 }}>
        Revenue trend
      </p>
      <div className="fin-chart">
        {years.map((y) => (
          <div className="fin-bar-col" key={y.fiscalYear}>
            <span className="fin-bar-label-top">
              {y.revenueCr !== null ? fmtCr(y.revenueCr) : "—"}
            </span>
            <div
              className="fin-bar"
              style={{
                height: `${y.revenueCr && maxRevenue ? Math.max(8, (y.revenueCr / maxRevenue) * 100) : 8}%`,
              }}
            />
            <span className="fin-bar-x">{y.fiscalYear}</span>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="dates">
          <thead>
            <tr>
              <th>Year</th>
              <th>Revenue</th>
              <th>EBITDA</th>
              <th>Profit after tax</th>
              <th>EPS</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.fiscalYear}>
                <td>{y.fiscalYear}</td>
                <td>{y.revenueCr !== null ? fmtCr(y.revenueCr) : "—"}</td>
                <td>{y.ebitdaCr !== null ? fmtCr(y.ebitdaCr) : "—"}</td>
                <td>{y.patCr !== null ? fmtCr(y.patCr) : "—"}</td>
                <td>{y.eps !== null ? `₹${y.eps}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="section-label" style={{ marginTop: 22 }}>
        Balance sheet (latest verified year: {latest.fiscalYear})
      </p>
      <div className="ratio-grid">
        <div className="ratio-tile"><div className="stat-k">Total assets</div><div className="stat-v">{latest.assetsCr !== null ? fmtCr(latest.assetsCr) : "—"}</div></div>
        <div className="ratio-tile"><div className="stat-k">Net worth</div><div className="stat-v">{latest.netWorthCr !== null ? fmtCr(latest.netWorthCr) : "—"}</div></div>
        <div className="ratio-tile"><div className="stat-k">Borrowings</div><div className="stat-v">{latest.borrowingsCr !== null ? fmtCr(latest.borrowingsCr) : "—"}</div></div>
        <div className="ratio-tile"><div className="stat-k">EBITDA</div><div className="stat-v">{latest.ebitdaCr !== null ? fmtCr(latest.ebitdaCr) : "—"}</div></div>
      </div>
      <p className="section-label" style={{ marginTop: 22 }}>
        Key ratios (latest year: {latest.fiscalYear})
      </p>
      <div className="ratio-grid">
        <div className="ratio-tile">
          <div className="stat-k">P/E</div>
          <div className="stat-v">{latest.peRatio !== null ? `${latest.peRatio}x` : "Not yet listed"}</div>
        </div>
        <div className="ratio-tile">
          <div className="stat-k">
            <abbr title="Return on Net Worth (reported as ROE in source filings)">RoNW</abbr>
          </div>
          <div className="stat-v">{latest.ronwPct !== null ? `${latest.ronwPct}%` : "—"}</div>
        </div>
        <div className="ratio-tile">
          <div className="stat-k">
            <abbr title="Debt to Equity ratio">D/E</abbr>
          </div>
          <div className="stat-v">{latest.debtEquity ?? "—"}</div>
        </div>
        <div className="ratio-tile">
          <div className="stat-k">EPS</div>
          <div className="stat-v">{latest.eps !== null ? `₹${latest.eps}` : "—"}</div>
        </div>
      </div>
    </>
  );
}

export function FinancialsPanel({ ipo }: { ipo: BoardIpo }) {
  if (ipo.financials.length === 0) {
    const filings = ipo.documents.filter((document) => document.docType === "rhp" || document.docType === "drhp");
    return (
      <>
        <StatePanel title="Financial figures are being verified">
          {filings.length > 0
            ? "We have not published revenue, profit or balance-sheet figures without page-level filing evidence. Open the official filing below while verification is pending."
            : "We have not published revenue, profit or balance-sheet figures without page-level filing evidence. An official filing link has not been captured yet."}
        </StatePanel>
        {filings.length > 0 && <div className="doc-list" style={{ marginTop: 12 }}>
          {filings.map((document) => <a key={document.url} className="doc-row" href={document.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <span className="stamp">{document.docType.toUpperCase()}</span>
            <span className="doc-copy"><span className="doc-name">{document.label}</span><span className="doc-source">{document.evidenceLabel} · {document.sourceHost}</span></span>
            <span className="doc-sub">Open official filing ↗</span>
          </a>)}
        </div>}
      </>
    );
  }

  return (
    <>
      <FinancialsContent financials={ipo.financials} />
      <p className="disclaimer">
        Published only after filing review. Open the evidence used for each year:
      </p>
      <div className="doc-list">
        {ipo.financials.flatMap((year) => year.sources.map((source) => (
          <a
            key={`${year.fiscalYear}-${source.url}-${source.pageNumber ?? "document"}`}
            className="doc-row"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <span className="stamp">{source.documentType}</span>
            <span className="doc-copy">
              <span className="doc-name">{year.fiscalYear} · {source.metrics.map((metric) => metric.replace("_", " ")).join(", ")}</span>
              <span className="doc-source">
                Reviewed {fmtDate(source.verificationDate)}
                {source.pageNumber ? ` · page ${source.pageNumber}` : ""}
              </span>
            </span>
            <span className="doc-sub">Open ↗</span>
          </a>
        )))}
      </div>
    </>
  );
}

export function DocumentsPanel({ ipo }: { ipo: BoardIpo }) {
  const registrarUrl = registrarAllotmentUrl(ipo.registrar);
  return (
    <>
      {ipo.documents.length > 0 ? (
        <div className="doc-list" style={{ marginBottom: 16 }}>
          {ipo.documents.map((doc) => (
            <a
              key={doc.url}
              className="doc-row"
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <span className="stamp">{doc.docType === "drhp" ? "DR" : doc.docType === "rhp" ? "RHP" : "DOC"}</span>
              <span className="doc-copy">
                <span className="doc-name">{doc.label}</span>
                <span className="doc-source">{doc.evidenceLabel} · {doc.sourceHost}</span>
              </span>
              <span className="doc-sub">Open ↗</span>
            </a>
          ))}
        </div>
      ) : (
        <StatePanel title="Primary documents are not available yet">
          RHP, DRHP, and anchor-allocation links will appear here once their official sources are loaded.
        </StatePanel>
      )}
      <p className="contacts">
        <b>Registrar:</b>{" "}
        {registrarUrl ? (
          <a href={registrarUrl} target="_blank" rel="noopener noreferrer">
            {ipo.registrar}
          </a>
        ) : (
          ipo.registrar ?? "Not available yet"
        )}
        <br />
        <b>Lead manager{ipo.leadManagers.length > 1 ? "s" : ""}:</b>{" "}
        {ipo.leadManagers.length ? ipo.leadManagers.join(", ") : "Not available yet"}
      </p>
    </>
  );
}

const COMPARE_ROWS: {
  label: string;
  render: (ipo: BoardIpo, now: number) => React.ReactNode;
}[] = [
  { label: "Verification", render: (ipo) => ipo.verification.label },
  { label: "Status", render: (ipo, now) => badgeText(effectiveStatus(ipo, now)) },
  { label: "Board", render: (ipo) => (ipo.board === "MAINBOARD" ? "Mainboard" : "SME") },
  { label: "Price band", render: (ipo) => `₹${ipo.priceBandLow} – ₹${ipo.priceBandHigh}` },
  { label: "Lot size", render: (ipo) => `${ipo.lotSize} shares` },
  { label: "Min. investment", render: (ipo) => fmtINR(ipo.lotSize * ipo.priceBandHigh) },
  { label: "Issue size", render: (ipo) => fmtCr(ipo.issueSizeCr) },
  {
    label: "GMP",
    render: (ipo, now) =>
      ipo.gmp ? (
        <>
          {fmtINR(ipo.gmp.medianValue)}{" "}
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
            ({confidenceLabel(ipo.gmp.confidence)}
            {isStale(ipo.gmp.capturedAt, now) ? " · Stale" : ""})
          </span>
        </>
      ) : (
        "Not available yet"
      ),
  },
  { label: "Subscription", render: (ipo) => subSummary(ipo) },
  {
    label: "Latest year revenue",
    render: (ipo) => {
      const verified = ipo.financials.filter((f) => f.verified);
      const latest = verified[0];
      return latest?.revenueCr != null ? fmtCr(latest.revenueCr) : "Not verified yet";
    },
  },
  {
    label: "Latest year P/E",
    render: (ipo) => {
      const verified = ipo.financials.filter((f) => f.verified);
      const latest = verified[0];
      return latest?.peRatio != null ? `${latest.peRatio}x` : "Not verified yet";
    },
  },
  { label: "Opens", render: (ipo) => fmtDate(ipo.openDate) },
  { label: "Closes", render: (ipo) => fmtDate(ipo.closeDate) },
  { label: "Listing", render: (ipo) => fmtDate(ipo.listingDate) },
  { label: "Registrar", render: (ipo) => ipo.registrar ?? "Not available yet" },
];

function CompareTable({
  ipos,
  now,
  onClose,
  onClear,
}: {
  ipos: BoardIpo[];
  now: number;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-name">Compare {ipos.length} IPOs</div>
          <div className="detail-meta">GMP, subscription, and financials are unofficial/unverified unless noted — see Methodology.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear all
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close comparison">
            ✕ Close
          </button>
        </div>
      </div>
      <div className="dpanel">
        <div className="table-wrap">
          <table className="dates compare-table">
            <thead>
              <tr>
                <th></th>
                {ipos.map((ipo) => (
                  <th key={ipo.id}>
                    <a href={`/ipo/${ipo.slug}`}>{ipo.companyName}</a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.label}>
                  <td style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)" }}>{row.label}</td>
                  {ipos.map((ipo) => (
                    <td key={ipo.id}>{row.render(ipo, now)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  ipos,
  boardFilter,
  now,
  month,
  onPrevMonth,
  onNextMonth,
}: {
  ipos: BoardIpo[];
  boardFilter: BoardFilter;
  now: number;
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const eventsByDay = useMemo(() => lifecycleEventsByDay(ipos), [ipos]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const todayKey = marketDayKey(now);
  const monthPrefix = `${year}-${String(m + 1).padStart(2, "0")}`;
  const activeSelectedDay = selectedDay?.startsWith(monthPrefix) ? selectedDay : null;
  const agendaEvents = useMemo(() => {
    const events = activeSelectedDay
      ? eventsByDay[activeSelectedDay] ?? []
      : Object.values(eventsByDay).flat().filter((event) => event.dayKey >= todayKey);
    return sortCalendarAgendaEvents(events, now);
  }, [activeSelectedDay, eventsByDay, now, todayKey]);
  const agendaGroups = useMemo(() => {
    const groups: { dayKey: string; events: IpoCalendarEvent<BoardIpo>[] }[] = [];
    for (const event of agendaEvents) {
      const current = groups.at(-1);
      if (current?.dayKey === event.dayKey) current.events.push(event);
      else groups.push({ dayKey: event.dayKey, events: [event] });
    }
    return groups;
  }, [agendaEvents]);
  const feedUrl = calendarFeedUrl(boardFilter);

  async function copyCalendarFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, m, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="btn btn-ghost" onClick={onPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <span className="calendar-month">{monthLabel}</span>
        <button type="button" className="btn btn-ghost" onClick={onNextMonth} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="calendar-legend">
        <span className="cal-legend-item"><span className="cal-dot cal-opens" /> Opens</span>
        <span className="cal-legend-item"><span className="cal-dot cal-closes" /> Closes</span>
        <span className="cal-legend-item"><span className="cal-dot cal-allotment" /> Allotment</span>
        <span className="cal-legend-item"><span className="cal-dot cal-lists" /> Lists</span>
      </div>
      <div className="calendar-actions">
        <a className="ui-button ui-button-primary" href={googleCalendarSubscriptionUrl(boardFilter)} target="_blank" rel="noopener noreferrer">
          Sync {boardFilterLabel(boardFilter)} to Google Calendar ↗
        </a>
        <a className="ui-button ui-button-secondary" href={`/api/calendar${boardFilterQuery(boardFilter)}`}>
          Download {boardFilterLabel(boardFilter)} dates (.ics)
        </a>
        <button type="button" className="ui-button ui-button-secondary" onClick={copyCalendarFeed}>
          Copy live calendar URL
        </button>
      </div>
      <div className="calendar-sync-note">
        <p>This is a live calendar subscription. New and changed dates update automatically on Google&apos;s refresh schedule. Every event links back here for current details and sources.</p>
        <p>Google only allows adding a calendar URL from its desktop website. If the Google button does not add it automatically, use Other calendars → From URL and paste the copied link.</p>
        <output aria-live="polite">{copyStatus === "copied" ? "Calendar URL copied." : copyStatus === "failed" ? `Copy failed. Use this URL: ${feedUrl}` : ""}</output>
      </div>
      <div className="calendar-grid calendar-dow">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cal-cell cal-empty" />;
          const key = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayEvents = eventsByDay[key] ?? [];
          return (
            <div key={i} className={"cal-cell" + (key === todayKey ? " cal-today" : "") + (key === activeSelectedDay ? " cal-selected" : "")}>
              <button
                type="button"
                className="cal-daynum"
                aria-label={`Show ${dayEvents.length} IPO event${dayEvents.length === 1 ? "" : "s"} for ${key}`}
                aria-pressed={key === activeSelectedDay}
                onClick={() => setSelectedDay((current) => current === key ? null : key)}
              >
                {d}
              </button>
              {dayEvents.map((e, idx) => (
                <a
                  key={idx}
                  href={`/ipo/${e.ipo.slug}`}
                  className={"cal-event cal-" + e.type}
                  title={`${e.ipo.companyName} — ${e.label}`}
                >
                  {e.ipo.companyName}
                </a>
              ))}
            </div>
          );
        })}
      </div>
      {Object.keys(eventsByDay).length === 0 && (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5, marginTop: 12 }}>
          No IPO dates to show yet.
        </p>
      )}
      <section className="calendar-agenda" aria-labelledby="calendar-agenda-title">
        <div className="calendar-agenda-head">
          <div>
            <p className="board-kicker">Date-wise details</p>
            <h2 id="calendar-agenda-title">
              {activeSelectedDay
                ? new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${activeSelectedDay}T00:00:00+05:30`))
                : "Today and upcoming IPO dates"}
            </h2>
            {!activeSelectedDay && <p>Today&apos;s IPO events appear first. Opening, closing, allotment and listing dates follow in order.</p>}
          </div>
          {activeSelectedDay && <button type="button" className="btn btn-ghost" onClick={() => setSelectedDay(null)}>Show today + upcoming</button>}
        </div>
        <div className="calendar-agenda-list">
          {agendaGroups.map((group) => {
            const first = group.events[0];
            const isToday = group.dayKey === todayKey;
            const firstTiming = calendarEventTimingLabel(first, now);
            const heading = isToday
              ? "Today"
              : firstTiming.endsWith("tomorrow")
                ? "Tomorrow"
                : formatMarketDate(first.iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            return (
              <section className={`calendar-agenda-day${isToday ? " is-today" : ""}`} key={group.dayKey} aria-labelledby={`agenda-${group.dayKey}`}>
                <div className="calendar-agenda-day-head">
                  <h3 id={`agenda-${group.dayKey}`}>{heading}</h3>
                  <span>{group.events.length} event{group.events.length === 1 ? "" : "s"}</span>
                </div>
                <div className="calendar-agenda-day-events">
                  {group.events.map((event) => (
                    <div className={`calendar-agenda-event${isToday ? " is-today" : ""}`} key={`${event.ipo.id}-${event.type}-${event.dayKey}`}>
                      <div className={`calendar-event-label cal-${event.type}`}>
                        <span>{calendarEventTimingLabel(event, now)}</span>
                        <time dateTime={event.dayKey}>{fmtDate(event.iso)}</time>
                      </div>
                      <CatalogueRow ipo={event.ipo} now={now} event={event} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {agendaEvents.length === 0 && (
            <StatePanel title={activeSelectedDay ? "No IPO events on this date" : "No upcoming IPO events"}>
              Choose another date. Early filings without final dates remain in IPO Pipeline.
            </StatePanel>
          )}
        </div>
      </section>
    </div>
  );
}
