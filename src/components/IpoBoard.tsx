"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardIpo } from "@/lib/board-data";
import {
  badgeText,
  countdownText,
  effectiveStatus,
  fmtCr,
  fmtDate,
  fmtDateShort,
  fmtINR,
  gmpPct,
  gmpUpdatedText,
  lifecycleDoneUpTo,
  LIFECYCLE_STEPS,
  listingGainPct,
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
  const router = useRouter();

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const list = useMemo(() => {
    const filtered = ipos.filter((i) => i.status === tab);
    if (tab === "OPEN") {
      return [...filtered].sort(
        (a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime(),
      );
    }
    return filtered;
  }, [ipos, tab]);

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
            <span className="wordmark">IPODekho</span>
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
        <div className="sort-note">
          {tab === "OPEN" ? "Sorted by closing soonest" : ""}
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
          />
        ))}
        {list.length === 0 && (
          <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
            No IPOs in this category right now.
          </p>
        )}
      </div>

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
        IPODekho tracks real Indian IPOs. Grey market premium (GMP) is
        informal, unregulated dealer-street pricing gathered from multiple
        public sources — not a guarantee of listing price.
      </footer>
    </div>
  );
}

function Card({
  ipo,
  now,
  selected,
  onSelect,
}: {
  ipo: BoardIpo;
  now: number;
  selected: boolean;
  onSelect: () => void;
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
    <button
      className={"card status-" + es + (selected ? " selected" : "")}
      type="button"
      onClick={onSelect}
    >
      <div className="card-top">
        <span className={"badge badge-" + es}>{badgeText(es)}</span>
        <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
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
        <div className="gmp-meta">
          {gmpUpdatedText(ipo.gmp.capturedAt, now)} · {ipo.gmp.confidence.charAt(0) + ipo.gmp.confidence.slice(1).toLowerCase()} confidence
        </div>
      )}
      <div className="card-foot">
        <span>{subSummary(ipo)}</span>
        {footRight}
      </div>
    </button>
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
        <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close details">
          ✕ Close
        </button>
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
        {dtab === "financials" && <FinancialsPanel />}
        {dtab === "subscription" && <SubscriptionPanel ipo={ipo} />}
        {dtab === "gmp" && <GmpPanel ipo={ipo} now={now} />}
        {dtab === "documents" && <DocumentsPanel ipo={ipo} />}
      </div>
    </div>
  );
}

function OverviewPanel({
  ipo,
  now,
  watching,
  onToggleWatch,
}: {
  ipo: BoardIpo;
  now: number;
  watching: boolean;
  onToggleWatch: () => void;
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
                Updated {gmpUpdatedText(ipo.gmp.capturedAt, now)} · Median of {ipo.gmp.sourceCount}{" "}
                source{ipo.gmp.sourceCount !== 1 ? "s" : ""} ·{" "}
                {ipo.gmp.confidence.charAt(0) + ipo.gmp.confidence.slice(1).toLowerCase()} confidence
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
        {ipo.status === "CLOSED" && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => alert(`Would deep-link to ${ipo.registrar ?? "the registrar"}.`)}
          >
            Check allotment status ↗
          </button>
        )}
        <button
          className={"btn" + (watching ? " watching" : "")}
          type="button"
          onClick={onToggleWatch}
        >
          {watching ? "✓ Watching" : "+ Watchlist"}
        </button>
      </div>
    </>
  );
}

function SubscriptionPanel({ ipo }: { ipo: BoardIpo }) {
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

function GmpPanel({ ipo, now }: { ipo: BoardIpo; now: number }) {
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
            Updated {gmpUpdatedText(ipo.gmp.capturedAt, now)} · median of {ipo.gmp.sourceCount} source
            {ipo.gmp.sourceCount !== 1 ? "s" : ""} ·{" "}
            {ipo.gmp.confidence.charAt(0) + ipo.gmp.confidence.slice(1).toLowerCase()} confidence
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: "8px 0 0" }}>
          Trend chart appears once the pipeline has collected enough history for this IPO.
        </p>
      </div>
      <p className="disclaimer">
        GMP is informal, unregulated grey-market pricing gathered from multiple public sources
        outside any exchange. It reflects sentiment, not a guarantee of where the stock will list.
      </p>
    </>
  );
}

function FinancialsPanel() {
  return (
    <p style={{ color: "var(--ink-muted)" }}>
      Financials are entered through a reviewed pipeline sourced from the RHP, not scraped — not
      yet available for this IPO.
    </p>
  );
}

function DocumentsPanel({ ipo }: { ipo: BoardIpo }) {
  return (
    <>
      <p style={{ color: "var(--ink-muted)", marginBottom: 16 }}>
        Document links (RHP/DRHP/anchor list) aren&apos;t loaded for this IPO yet.
      </p>
      <p className="contacts">
        <b>Registrar:</b> {ipo.registrar ?? "Not available yet"}
        <br />
        <b>Lead manager{ipo.leadManagers.length > 1 ? "s" : ""}:</b>{" "}
        {ipo.leadManagers.length ? ipo.leadManagers.join(", ") : "Not available yet"}
      </p>
    </>
  );
}
