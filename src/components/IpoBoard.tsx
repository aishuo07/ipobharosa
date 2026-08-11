"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardIpo } from "@/lib/board-data";
import {
  badgeText,
  confidenceLabel,
  countdownText,
  effectiveStatus,
  fmtCr,
  fmtDate,
  fmtDateShort,
  fmtINR,
  gmpPct,
  gmpUpdatedText,
  isStale,
  lifecycleDoneUpTo,
  LIFECYCLE_STEPS,
  listingGainPct,
  registrarAllotmentUrl,
  subSummary,
  timeUntil,
} from "@/lib/board-helpers";

const TAB_DEFS: { key: BoardIpo["status"]; label: string }[] = [
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

export default function IpoBoard({
  ipos,
  user = null,
  watchlistedIds = [],
  onSignOut,
}: {
  ipos: BoardIpo[];
  user?: BoardUser;
  watchlistedIds?: string[];
  onSignOut?: () => Promise<void>;
}) {
  const [tab, setTab] = useState<BoardIpo["status"]>("OPEN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dtab, setDtab] = useState<DTab>("overview");
  const [watching, setWatching] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(watchlistedIds.map((id) => [id, true])),
  );
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const router = useRouter();

  const MAX_COMPARE = 3;

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

  const compareList = useMemo(
    () => compareIds.map((id) => ipos.find((i) => i.id === id)).filter((i): i is BoardIpo => !!i),
    [compareIds, ipos],
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
      return ipos
        .filter(
          (i) => i.companyName.toLowerCase().includes(trimmed) || i.sector.toLowerCase().includes(trimmed),
        )
        .sort((a, b) => a.companyName.localeCompare(b.companyName));
    }

    const filtered = ipos.filter((i) => i.status === tab);
    if (tab === "OPEN") {
      return [...filtered].sort(
        (a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime(),
      );
    }
    return filtered;
  }, [ipos, tab, query]);

  const selected = ipos.find((i) => i.id === selectedId) ?? null;

  function selectCard(id: string) {
    const opening = selectedId !== id;
    setSelectedId(opening ? id : null);
    setDtab("overview");
  }

  function changeTab(key: BoardIpo["status"]) {
    setTab(key);
    setSelectedId(null);
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

      <div className="controls">
        <div className="tabs" role="tablist" aria-label="IPO status">
          {TAB_DEFS.map((t) => {
            const count = ipos.filter((i) => i.status === t.key).length;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                className={"tab" + (tab === t.key ? " active" : "")}
                onClick={() => changeTab(t.key)}
              >
                {t.label} <span className="n">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="search-wrap">
          <input
            type="search"
            className="search-box"
            placeholder="Search by company or sector"
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
          {query
            ? `${list.length} result${list.length !== 1 ? "s" : ""} for "${query.trim()}"`
            : tab === "OPEN"
              ? "Sorted by closing soonest"
              : ""}
        </div>
      </div>

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
          <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
            {query ? `No IPOs match "${query.trim()}".` : "No IPOs in this category right now."}
          </p>
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
          <CompareTable ipos={compareList} now={now} onClose={() => setShowCompare(false)} onClear={() => { setCompareIds([]); setShowCompare(false); }} />
        </div>
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
  } else if (ipo.status === "CLOSED") {
    footRight = `Allotment ${fmtDateShort(ipo.allotmentDate)}`;
  } else {
    footRight = `Listed ${fmtDateShort(ipo.listingDate)}`;
  }

  const gainPct = listingGainPct(ipo);
  const gmpBlock =
    ipo.status === "LISTED" && gainPct !== null ? (
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
    ipo.status === "LISTED" ? (
      "Listing gain"
    ) : (
      <abbr title="Grey Market Premium — unofficial, unregulated dealer-street pricing. Not exchange-verified.">
        GMP · unofficial
      </abbr>
    );

  return (
    <div
      className={"card status-" + es + (selected ? " selected" : "")}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="card-top">
        <span className={"badge badge-" + es}>{badgeText(es)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
          <button
            type="button"
            className="card-watch-btn"
            aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
            aria-pressed={watching}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch();
            }}
          >
            {watching ? "★" : "☆"}
          </button>
        </div>
      </div>
      <div>
        <div className="card-name">{ipo.companyName}</div>
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
        onClick={(e) => e.stopPropagation()}
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
    </div>
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
              No GMP data captured yet — the ingestion pipeline runs every 2 hours during market
              hours.
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
      <p style={{ color: "var(--ink-muted)" }}>
        Bidding hasn&apos;t opened yet, or no subscription data has been captured for this IPO —
        it will appear here once the ingestion pipeline picks it up.
      </p>
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
  const overall = (cats.reduce((sum, c) => sum + c.value, 0) / cats.length).toFixed(1);
  const maxScale = 20;

  return (
    <>
      <div className="sub-overall">
        <span className="big">{overall}x</span>
        <span className="lbl">overall subscription</span>
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
    </>
  );
}

export function GmpPanel({ ipo, now }: { ipo: BoardIpo; now: number }) {
  if (!ipo.gmp) {
    return (
      <p style={{ color: "var(--ink-muted)" }}>
        No GMP data captured yet for this IPO. The ingestion pipeline scrapes multiple public
        sources every 2 hours during market hours — check back soon.
      </p>
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
          >
            <title>
              {fmtDateShort(points[i].capturedAt)} — ₹{p[2]}
            </title>
          </circle>
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
              <th>Profit after tax</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.fiscalYear}>
                <td>{y.fiscalYear}</td>
                <td>{y.revenueCr !== null ? fmtCr(y.revenueCr) : "—"}</td>
                <td>{y.patCr !== null ? fmtCr(y.patCr) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const verified = ipo.financials.filter((f) => f.verified);
  const unverified = ipo.financials.filter((f) => !f.verified);

  if (verified.length === 0 && unverified.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)" }}>
        Financials aren&apos;t available for this IPO yet.
      </p>
    );
  }

  if (verified.length === 0) {
    // Data exists but no human has checked it against the RHP yet — don't
    // present scraped numbers as fact by default. Real financials carry
    // more reputational risk than GMP if wrong.
    return (
      <>
        <p style={{ color: "var(--ink-muted)", marginBottom: 12 }}>
          Financials for this IPO have been scraped from a public source but not yet manually
          verified against the RHP — not shown by default.
        </p>
        <details className="src-detail">
          <summary>View unverified scraped data anyway</summary>
          <div style={{ marginTop: 12 }}>
            <FinancialsContent financials={unverified} />
            <p className="disclaimer">
              Unverified — sourced from a third-party aggregator, not yet cross-checked against
              the actual RHP filing by a human reviewer. Treat as indicative only.
            </p>
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      <FinancialsContent financials={verified} />
      <p className="disclaimer">
        Verified against the IPO&apos;s RHP.
        {unverified.length > 0 &&
          ` ${unverified.length} more recent year${unverified.length > 1 ? "s" : ""} scraped but pending verification.`}
      </p>
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
              <span className="doc-name">{doc.label}</span>
              <span className="doc-sub">PDF ↗</span>
            </a>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--ink-muted)", marginBottom: 16 }}>
          Document links (RHP/DRHP/anchor list) aren&apos;t loaded for this IPO yet.
        </p>
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
