import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SubscriptionAlertBanner } from "@/components/SubscriptionAlertBanner";
import PwaBootstrap from "@/components/pwa/PwaBootstrap";
import OfflineBanner from "@/components/pwa/OfflineBanner";
import MobileBootstrap from "@/components/mobile/MobileBootstrap";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ExpPlan Obras",
  description: "Plataforma corporativa de engenharia civil",
  icons: {
    icon: [{ url: "/favicon_do_site.png", type: "image/png" }],
    shortcut: [{ url: "/favicon_do_site.png", type: "image/png" }],
    apple: [{ url: "/favicon_do_site.png", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaBootstrap />
        <MobileBootstrap />
        <OfflineBanner />
        <SubscriptionAlertBanner />
        {children}
      </body>
    </html>
  );
}
