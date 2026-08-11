import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IPODekho — IPO Board",
  description:
    "Track open, upcoming, and listed IPOs in India — price band, lot size, subscription, and grey market premium with honest source confidence, not blind numbers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
