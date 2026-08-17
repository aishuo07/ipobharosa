import type { Metadata } from "next";
import { resolveSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = resolveSiteUrl();
const siteDescription =
  "Track Indian Mainboard and SME IPO dates, price bands, lot sizes, subscription and unofficial GMP with visible sources and honest verification status.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "IPOBharosa — Indian IPO dates, GMP and verified sources",
    template: "%s | IPOBharosa",
  },
  description: siteDescription,
  applicationName: "IPOBharosa",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "IPOBharosa",
    title: "IPOBharosa — Indian IPOs, with sources you can verify",
    description: siteDescription,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "IPOBharosa — Indian IPOs, with sources you can verify" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPOBharosa — Indian IPOs, with sources you can verify",
    description: siteDescription,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
