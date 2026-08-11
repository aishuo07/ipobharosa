import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoardIpoBySlug, getBoardIpos } from "@/lib/board-data";
import {
  DocumentsPanel,
  FinancialsPanel,
  GmpPanel,
  OverviewPanel,
  SubscriptionPanel,
} from "@/components/IpoBoard";
import { badgeText, confidenceLabel, countdownText, effectiveStatus, fmtDate } from "@/lib/board-helpers";

// GMP figures matter most for this page and refresh every 2 hours —
// 30 minutes keeps a crawled/cached copy reasonably current without
// hitting the database on every single request.
export const revalidate = 1800;

export async function generateStaticParams() {
  const ipos = await getBoardIpos();
  return ipos.map((ipo) => ({ slug: ipo.slug }));
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
    <div className="wrap">
      <div className="legal-head">
        <Link href="/" className="legal-back">
          ← IPOBharosa
        </Link>
      </div>

      <article className="detail-wrap" style={{ marginTop: 8 }}>
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="detail-title-row">
                <span className={"badge badge-" + es}>{badgeText(es)}</span>
                {countdown}
                <span className="board-tag">{ipo.board === "MAINBOARD" ? "Mainboard" : "SME"}</span>
              </div>
              <h1 className="detail-name">{ipo.companyName} IPO</h1>
              <div className="detail-meta">
                {ipo.sector} · Registrar: {ipo.registrar ?? "Not available yet"}
              </div>
            </div>
          </div>

          <div className="dpanel">
            <h2 className="section-label" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              Overview
            </h2>
            <OverviewPanel ipo={ipo} now={now} watching={false} />
          </div>
        </div>

        <div className="detail" style={{ marginTop: 20 }}>
          <div className="dpanel">
            <h2 className="section-label" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              Subscription
            </h2>
            <SubscriptionPanel ipo={ipo} />
          </div>
        </div>

        <div className="detail" style={{ marginTop: 20 }}>
          <div className="dpanel">
            <h2 className="section-label" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              GMP trend
            </h2>
            <GmpPanel ipo={ipo} now={now} />
          </div>
        </div>

        <div className="detail" style={{ marginTop: 20 }}>
          <div className="dpanel">
            <h2 className="section-label" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              Financials
            </h2>
            <FinancialsPanel ipo={ipo} />
          </div>
        </div>

        <div className="detail" style={{ marginTop: 20 }}>
          <div className="dpanel">
            <h2 className="section-label" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              Documents
            </h2>
            <DocumentsPanel ipo={ipo} />
          </div>
        </div>

        <div className="legal-cross">
          <Link href="/">View this IPO on the live board</Link> ·{" "}
          <Link href="/methodology">How we source this data</Link>
        </div>
      </article>
    </div>
  );
}
