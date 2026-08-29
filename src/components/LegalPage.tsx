import Link from "next/link";

const CROSS_LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="legal-head">
        <Link href="/board" className="legal-back">
          ← IPOBharosa
        </Link>
      </div>
      <div className="legal-wrap">
        <h1>{title}</h1>
        <div className="legal-updated">Last updated {updated}</div>
        {children}
        <div className="legal-cross">
          {CROSS_LINKS.map((l, i) => (
            <span key={l.href}>
              {i > 0 && " · "}
              <a href={l.href}>{l.label}</a>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
