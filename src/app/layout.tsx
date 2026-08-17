import type { Metadata, Viewport } from "next";
import { resolveSiteUrl } from "@/lib/site-url";
import { PwaRegistration } from "@/components/InstallApp";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IPOBharosa",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
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

export const viewport: Viewport = {
  themeColor: "#173C32",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
