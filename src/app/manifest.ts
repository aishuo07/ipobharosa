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
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icons/icon-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/og.png",
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
        label: "IPOBharosa Board View",
      },
    ],
  };
}
