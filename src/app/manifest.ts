import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "IPOBharosa — Indian IPO Tracker",
    short_name: "IPOBharosa",
    description: "Indian Mainboard and SME IPO dates, price bands, demand and unofficial GMP with visible source status.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F7F8F4",
    theme_color: "#173C32",
    orientation: "any",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
