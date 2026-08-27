import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Disclaimer — IPOBharosa",
  description: "IPOBharosa is not investment advice. Read the disclaimer before using GMP or subscription data on this site.",
};

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" updated="12 Aug 2026">
      <p>
        IPOBharosa is an information aggregation tool, not a source of financial advice. Please read this
        before acting on anything you see on the site.
      </p>

      <h2>Not investment advice</h2>
      <p>
        Nothing on IPOBharosa is a recommendation to apply for, buy, hold, or avoid any IPO or security. We
        are not a SEBI-registered investment adviser, research analyst, or broker, and nothing here should be
        treated as a substitute for advice from one.
      </p>

      <h2>Grey Market Premium (GMP) is not an official figure</h2>
      <p>
        GMP is informal, unregulated dealer-street pricing. It is not published, endorsed, or verified by any
        stock exchange or regulator, and it has no guaranteed relationship to actual listing price or
        post-listing performance. See our <a href="/methodology">Methodology</a> for exactly how we source
        and combine it.
      </p>

      <h2>Third-party information</h2>
      <p>
        Most figures on this site are aggregated from publicly available third-party websites. Except where a
        figure is explicitly marked <strong>verified</strong>, we have not independently confirmed it against
        the underlying filing. Sources can be wrong, out of date, or temporarily unavailable.
      </p>

      <h2>No guarantee of accuracy or availability</h2>
      <p>
        IPOBharosa is provided &quot;as is,&quot; without any warranty of accuracy, completeness, or
        continuous availability. Automated data collection can and occasionally will produce gaps or errors —
        see our <a href="/methodology">Methodology</a> page for how we flag staleness and source agreement.
      </p>

      <h2>Your decisions are your own</h2>
      <p>
        Any decision to apply for, invest in, or trade any security is entirely your own responsibility. Please
        consult a qualified, registered financial advisor before making any investment decision.
      </p>

      <p>
        Found something on the site that&apos;s wrong? Email{" "}
        <a href="mailto:aish.iiitb@gmail.com">aish.iiitb@gmail.com</a> so we can correct it.
      </p>
    </LegalPage>
  );
}
