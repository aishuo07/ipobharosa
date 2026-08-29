import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getBoardIpoBySlug, type BoardIpo } from "@/lib/board-data";
import { DiscussionPanel } from "@/components/DiscussionPanel";
import {
  DocumentsPanel,
  FinancialsPanel,
  GmpPanel,
  OverviewPanel,
  SubscriptionPanel,
  VerificationNotice,
} from "@/components/IpoBoard";
import { Badge, Surface } from "@/components/ui";
import { badgeText, confidenceLabel, countdownText, effectiveStatus, fmtDate, fmtDateTime, fmtINR } from "@/lib/board-helpers";
import { googleCalendarSubscriptionUrl } from "@/lib/calendar";

// GMP figures matter most for this page and refresh every hour —
// 30 minutes keeps a crawled/cached copy reasonably current without
// hitting the database on every single request. The discussion section
// reads the session cookie, so the page is dynamic per request; keep the
// 30-minute revalidate for the data-driven sections and let Next.js treat
// it as dynamic because auth() reads cookies.
export const revalidate = 1800;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  // IPOs are database-driven and can be published every hour. Avoid a
  // build-time database/schema dependency: pages are generated on first
  // request and then follow the ISR policy above.
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ipo = await getBoardIpoBySlug(slug);
  if (!ipo) return {};

  const gmpBit = ipo.gmp
    ? `Current GMP ₹${Math.round(ipo.gmp.medianValue)} (${confidenceLabel(ipo.gmp.confidence).toLowerCase()}).`
    : "";
  const description =
    `${ipo.companyName} IPO — price band ₹${ipo.priceBandLow}-₹${ipo.priceBandHigh}, lot size ${ipo.lotSize} shares. ` +
    `${gmpBit} Opens ${fmtDate(ipo.openDate)}, closes ${fmtDate(ipo.closeDate)}. GMP, subscription, financials, and allotment dates.`;

  return {
    title: `${ipo.companyName} IPO — GMP, Price Band, Dates and Subscription`,
    description,
    alternates: { canonical: `/ipo/${ipo.slug}` },
    robots: ipo.verification.state === "VERIFIED"
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function IpoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ipo = await getBoardIpoBySlug(slug);
  if (!ipo) notFound();
  const session = await auth();

  // Server Component: this renders once per request/ISR revalidation
  // (revalidate = 1800s above), not on a client re-render, so a fresh
  // timestamp here is exactly the intended per-render behavior.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const es = effectiveStatus(ipo, now);
  const countdown =
    ipo.status === "OPEN" ? (
      <span className={"badge " + (es === "closing-soon" ? "badge-closing-soon" : "badge-open")}>
        {countdownText(ipo, now)}
      </span>
    ) : null;

  return (
    <div className="wrap ipo-detail-page">
      <div className="legal-head ipo-detail-back">
        <Link href="/" className="legal-back">
          ← Back to IPO board
        </Link>
      </div>

      <article className="detail-wrap ipo-detail-wrap">
        <Surface as="div" className="ipo-detail-hero">
          <div className="detail-title-row">
            <span className={"badge badge-" + es}>{badgeText(es)}</span>
            {countdown}
            <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
          </div>
          <p className="ipo-detail-kicker">IPO research brief</p>
          <h1 className="detail-name">{ipo.companyName} IPO</h1>
          <p className="detail-meta">
            {ipo.sector} · Registrar: {ipo.registrar ?? "Not available yet"}
          </p>
          <div className="ipo-detail-hero-facts" aria-label="IPO highlights">
            <div><span>Price band</span><strong>₹{ipo.priceBandLow}–₹{ipo.priceBandHigh}</strong></div>
            <div><span>Lot size</span><strong>{ipo.lotSize} shares</strong></div>
            <div><span>Minimum</span><strong>{fmtINR(ipo.lotSize * ipo.priceBandHigh)}</strong></div>
            <div><span>Listing</span><strong>{fmtDate(ipo.listingDate)}</strong></div>
          </div>
          <div className="ipo-calendar-actions" aria-label="Add IPO dates to calendar">
            <a className="ui-button ui-button-primary" href={`/api/calendar?ipo=${ipo.slug}`}>Download this IPO&apos;s dates (.ics)</a>
            <a className="ui-button ui-button-secondary" href={googleCalendarSubscriptionUrl("ALL", ipo.slug)} target="_blank" rel="noopener noreferrer">Subscribe only this IPO in Google Calendar ↗</a>
          </div>
        </Surface>

        <VerificationNotice ipo={ipo} />

        <nav className="ipo-detail-nav" aria-label="IPO detail sections">
          <a href="#overview">Overview</a>
          <a href="#application-facts">Application facts</a>
          <a href="#subscription">Subscription</a>
          <a href="#gmp">GMP</a>
          <a href="#financials">Financials</a>
          <a href="#documents">Documents</a>
          <a href="#discussion">Discussion</a>
        </nav>

        <div className="ipo-detail-evidence" aria-label="Evidence guide">
          <div>
            <Badge tone="positive">Official / verified</Badge>
            <p>Issue documents and reviewed financials are tied to primary filings.</p>
          </div>
          <div>
            <Badge tone="warning">Unofficial signal</Badge>
            <p>GMP is market sentiment from public sources, not exchange data or a prediction.</p>
          </div>
        </div>

        <Surface as="section" className="ipo-provenance">
          <header>
            <p className="ipo-detail-kicker">Transparent by default</p>
            <h2>Sources & verification</h2>
            <p>Every link opens the page we used. “Verified” is reserved for official filings or human-reviewed figures.</p>
          </header>
          <div className="provenance-grid">
            <ProvenanceGroup title="IPO facts" sources={ipo.provenance.discovery} />
            <ProvenanceGroup title="GMP · unofficial" sources={ipo.provenance.gmp} />
            <ProvenanceGroup title="Subscription" sources={ipo.provenance.subscription ? [ipo.provenance.subscription] : []} />
            <ProvenanceGroup title="Official filings" sources={[
              ...ipo.documents.map((doc) => ({ name: doc.label, url: doc.url, note: doc.docType.toUpperCase() })),
              ...(ipo.provenance.officialDocuments ?? []).map((doc) => ({ name: doc.label, url: doc.url, note: `${doc.source} · ${doc.kind}` })),
            ]} />
          </div>
          {(ipo.provenance.sourceChecks?.length ?? 0) > 0 && <div className="source-checks" aria-label="Latest official source checks">
            {ipo.provenance.sourceChecks?.map((check) => <div className="source-check" key={`${check.source}-${check.checkedAt}`}>
              <Badge tone={check.status === "FOUND" ? "positive" : check.status === "UNAVAILABLE" ? "warning" : "info"}>{check.source}</Badge>
              <strong>{sourceCheckLabel(check.status)}</strong>
              <small>{check.reason ?? `Checked ${fmtDateTime(check.checkedAt)}`}</small>
              {check.url && <a href={check.url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
            </div>)}
          </div>}
          {ipo.provenance.officialFields.length > 0 && <div className="table-wrap provenance-fields">
            <table className="dates">
              <thead><tr><th>IPO field</th><th>Status</th><th>Official value</th><th>Verified from</th><th>Checked</th></tr></thead>
              <tbody>{ipo.provenance.officialFields.map((field) => <tr key={`${field.field}-${field.url}`}>
                <td>{fieldLabel(field.field)}</td>
                <td><Badge tone={field.status === "MATCH" ? "positive" : field.status === "CONFLICT" ? "critical" : "warning"}>{field.status === "MATCH" ? "Matched" : field.status === "CONFLICT" ? "Conflict" : "Missing"}</Badge></td>
                <td>{field.value}</td>
                <td><a href={field.url} target="_blank" rel="noopener noreferrer">{field.source} ↗</a></td>
                <td>{fmtDateTime(field.checkedAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </Surface>

        <div className="ipo-detail-sections">
          <DetailSection id="overview" eyebrow="Decision essentials" title="Overview">
            <OverviewPanel ipo={ipo} now={now} watching={false} />
          </DetailSection>
          <DetailSection id="application-facts" eyebrow="Official exchange details" title="Application facts" tone="official">
            <ApplicationFacts facts={ipo.provenance.applicationFacts ?? []} />
          </DetailSection>
          <DetailSection id="subscription" eyebrow="Demand" title="Subscription">
            <SubscriptionPanel ipo={ipo} />
          </DetailSection>
          <DetailSection id="gmp" eyebrow="Unofficial market signal" title="GMP trend" tone="unofficial">
            <GmpPanel ipo={ipo} now={now} />
          </DetailSection>
          <DetailSection id="financials" eyebrow="Filing-backed fundamentals" title="Financials" tone="official">
            <FinancialsPanel ipo={ipo} />
          </DetailSection>
          <DetailSection id="documents" eyebrow="Primary sources" title="Documents" tone="official">
            <DocumentsPanel ipo={ipo} />
          </DetailSection>
          <DetailSection id="discussion" eyebrow="Community" title="Discussion">
            <DiscussionPanel
              ipoId={ipo.id}
              user={session?.user?.id ? { id: session.user.id, email: session.user.email ?? null, name: session.user.name ?? null } : null}
            />
          </DetailSection>
        </div>

        <div className="legal-cross">
          <Link href="/">View this IPO on the live board</Link> ·{" "}
          <Link href="/methodology">How we source this data</Link>
        </div>
      </article>
    </div>
  );
}

function fieldLabel(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase());
}

function sourceCheckLabel(status: string): string {
  if (status === "FOUND") return "Official record found";
  if (status === "NOT_FOUND") return "No matching issue found";
  if (status === "WRONG_ISSUE_TYPE") return "Different issue type";
  return "Temporarily unavailable";
}

function ApplicationFacts({ facts }: { facts: NonNullable<BoardIpo["provenance"]["applicationFacts"]> }) {
  if (!facts?.length) return <p className="official-empty">Official application details have not been captured yet. Core IPO terms above remain visible with their current verification state.</p>;
  return <div className="application-facts-grid">{facts.map((fact) => <a href={fact.url} target="_blank" rel="noopener noreferrer" key={`${fact.label}-${fact.source}`}>
    <span>{fact.label}</span>
    <strong>{fact.value}</strong>
    <small>{fact.source} ↗</small>
  </a>)}</div>;
}

function ProvenanceGroup({ title, sources }: { title: string; sources: { name: string; url: string; note: string }[] }) {
  return (
    <div className="provenance-group">
      <h3>{title}</h3>
      {sources.length ? sources.map((source) => (
        <a key={`${source.name}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer">
          <span>{source.name} ↗</span>
          <small>{source.note}</small>
        </a>
      )) : <p>Not captured yet</p>}
    </div>
  );
}

function DetailSection({
  id,
  eyebrow,
  title,
  tone,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  tone?: "official" | "unofficial";
  children: React.ReactNode;
}) {
  return (
    <Surface as="section" id={id} className="ipo-detail-section">
      <header className="ipo-detail-section-head">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {tone && (
          <Badge tone={tone === "official" ? "positive" : "warning"}>
            {tone === "official" ? "Official / verified" : "Unofficial signal"}
          </Badge>
        )}
      </header>
      <div className="dpanel">{children}</div>
    </Surface>
  );
}
