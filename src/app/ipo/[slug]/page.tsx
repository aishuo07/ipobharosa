import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoardIpoBySlug } from "@/lib/board-data";
import {
  DocumentsPanel,
  FinancialsPanel,
  GmpPanel,
  OverviewPanel,
  SubscriptionPanel,
} from "@/components/IpoBoard";
import { Badge, Surface } from "@/components/ui";
import { badgeText, confidenceLabel, countdownText, effectiveStatus, fmtDate, fmtINR } from "@/lib/board-helpers";
import { googleCalendarSubscriptionUrl } from "@/lib/calendar";

// GMP figures matter most for this page and refresh every 2 hours —
// 30 minutes keeps a crawled/cached copy reasonably current without
// hitting the database on every single request.
export const revalidate = 1800;

export async function generateStaticParams() {
  // IPOs are database-driven and can be published every two hours. Avoid a
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
    title: `${ipo.companyName} IPO — GMP, Price Band, Dates, Subscription | IPOBharosa`,
    description,
    alternates: { canonical: `/ipo/${ipo.slug}` },
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
            <a className="ui-button ui-button-secondary" href={googleCalendarSubscriptionUrl()} target="_blank" rel="noopener noreferrer">Subscribe in Google Calendar ↗</a>
          </div>
        </Surface>

        <nav className="ipo-detail-nav" aria-label="IPO detail sections">
          <a href="#overview">Overview</a>
          <a href="#subscription">Subscription</a>
          <a href="#gmp">GMP</a>
          <a href="#financials">Financials</a>
          <a href="#documents">Documents</a>
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
            <ProvenanceGroup title="Official filings" sources={ipo.documents.map((doc) => ({ name: doc.label, url: doc.url, note: doc.docType.toUpperCase() }))} />
          </div>
          {ipo.provenance.officialFields.length > 0 && <div className="table-wrap provenance-fields">
            <table className="dates">
              <thead><tr><th>IPO field</th><th>Official value</th><th>Verified from</th><th>Checked</th></tr></thead>
              <tbody>{ipo.provenance.officialFields.map((field) => <tr key={`${field.field}-${field.url}`}>
                <td>{fieldLabel(field.field)}</td>
                <td>{field.value}</td>
                <td><a href={field.url} target="_blank" rel="noopener noreferrer">{field.source} ↗</a></td>
                <td>{new Date(field.checkedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </Surface>

        <div className="ipo-detail-sections">
          <DetailSection id="overview" eyebrow="Decision essentials" title="Overview">
            <OverviewPanel ipo={ipo} now={now} watching={false} />
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
