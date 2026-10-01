import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "InCeipt – Receipts & invoices",
    short_name: "InCeipt",
    description: "Make neat receipts and invoices and send them on WhatsApp.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f5",
    theme_color: "#0b7a4b",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New receipt", url: "/create", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "New invoice", url: "/create?type=invoice", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
