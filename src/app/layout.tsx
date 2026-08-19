import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
import "./agfusion-pearl.css";
import "./agfusion-readability.css";
import "./agfusion-calibration.css";

const siteUrl = "https://agfusion.vercel.app";
const siteTitle = "AGFusion — Stablecoin operations on Arc";
const siteDescription = "AGFusion is an AI-assisted workspace for payments, treasury, agents, and developers on Arc — the Economic OS for programmable money with USDC gas and sub-second finality.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), title: siteTitle, description: siteDescription,
  keywords: ["AGFusion", "Arc Network", "Arc House", "USDC", "stablecoin", "Economic OS", "programmable money", "AI finance"],
  applicationName: "AGFusion", authors: [{ name: "AGFusion" }],
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon-180.png", sizes: "180x180", type: "image/png" }], apple: [{ url: "/apple-icon.png", sizes: "180x180" }], shortcut: ["/favicon.ico"] },
  openGraph: { type: "website", url: siteUrl, siteName: "AGFusion", title: siteTitle, description: siteDescription, images: [{ url: "/og.png", width: 1200, height: 630, alt: "AGFusion — AI-native stablecoin OS on Arc" }] },
  twitter: { card: "summary_large_image", site: "@AGfusion_", creator: "@AGfusion_", title: siteTitle, description: siteDescription, images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&family=Sora:wght@500;600;700&display=swap" rel="stylesheet" />
  </head><body className="antialiased selection:bg-blue-500/15"><AppShell>{children}</AppShell></body></html>;
}
