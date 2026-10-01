import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { ServiceWorker } from "@/components/pwa/service-worker";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter (Latin) self-hosted, ~48 KB. Loaded once, cached forever.
const inter = localFont({
  src: "../fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

// Just the ₦ glyph from Inter's Latin-extended set (~1 KB), so ₦ looks the same on every phone.
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
  themeColor: "#0b7a4b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${inter.variable} ${naira.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
