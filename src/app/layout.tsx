import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono, Sora } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
import "./agfusion-web3-premium.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const siteUrl = "https://agfusion.vercel.app";
const siteTitle = "AGFusion — Stablecoin operations on Arc";
const siteDescription = "AGFusion is an AI-assisted workspace for payments, treasury, agents, and developers on Arc — the Economic OS for programmable money with USDC gas and sub-second finality.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), title: siteTitle, description: siteDescription,
  keywords: ["AGFusion", "Arc Network", "Arc House", "USDC", "stablecoin", "Economic OS", "programmable money", "AI finance"],
  applicationName: "AGFusion", authors: [{ name: "AGFusion" }],
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon-180.png", sizes: "180x180", type: "image/png" }], apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }], shortcut: ["/favicon.ico"] },
  openGraph: { type: "website", url: siteUrl, siteName: "AGFusion", title: siteTitle, description: siteDescription, images: [{ url: "/og.png", width: 1200, height: 630, alt: "AGFusion — AI-native stablecoin OS on Arc" }] },
  twitter: { card: "summary_large_image", site: "@AGfusion_", creator: "@AGfusion_", title: siteTitle, description: siteDescription, images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070a0e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} ${sora.variable}`}
    >
      <body className="ag-premium-shell antialiased selection:bg-emerald-500/20">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
