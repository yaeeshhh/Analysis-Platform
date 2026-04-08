import type { Metadata, Viewport } from "next";
import { DM_Mono, Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import GlobalOverlays from "@/components/ui/GlobalOverlays";
import DesktopAccordionOpener from "@/components/ui/DesktopAccordionOpener";
import { MobileSlideProvider } from "@/components/ui/MobileSlideProvider";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Inter({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const monoFont = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#091018",
};

export const metadata: Metadata = {
  title: "Analysis Studio",
  description:
    "Analyze uploaded CSV files with automatic schema inference, quality checks, descriptive statistics, visualisations, and optional machine learning.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/apple-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Analysis Studio",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}
    >
      <body suppressHydrationWarning className="antialiased">
        <MobileSlideProvider>
          {children}
        </MobileSlideProvider>
        <DesktopAccordionOpener />
        <Suspense fallback={null}>
          <GlobalOverlays />
        </Suspense>
      </body>
    </html>
  );
}