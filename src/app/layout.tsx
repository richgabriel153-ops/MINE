import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { ServiceWorker } from "@/components/pwa/service-worker";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Atkinson Hyperlegible Next (Latin), self-hosted, ~34 KB. Designed for low vision: clear in sunlight on small screens.
const body = localFont({
  src: "../fonts/atkinson-next-latin.woff2",
  variable: "--font-body",
  weight: "200 800",
  display: "swap",
});

// Just the ₦ glyph (~1 KB; Atkinson has none), so ₦ looks the same on every phone.
const naira = localFont({
  src: "../fonts/inter-naira.woff2",
  variable: "--font-naira",
  weight: "100 900",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "InCeipt – Free receipts & invoices for your business",
    template: "%s · InCeipt",
  },
  description:
    "Make neat receipts and invoices on your phone in seconds and send them to customers on WhatsApp. Free for Nigerian small businesses.",
  applicationName: "InCeipt",
  appleWebApp: { capable: true, title: "InCeipt", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${body.variable} ${naira.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
