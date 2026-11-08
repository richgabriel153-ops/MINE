import type { Metadata, Viewport } from "next";
import { DM_Mono, Funnel_Display, Funnel_Sans } from "next/font/google";
import "./globals.css";

const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel-display" });
const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-funnel-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" });

export const metadata: Metadata = {
  title: "Linkup: random 1-on-1 video chat",
  description: "Video chat with a random stranger, one on one. No account needed. 18+ only.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1f10",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-bg text-ink">{children}</body>
    </html>
  );
}
