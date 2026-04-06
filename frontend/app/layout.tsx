import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import GlobalOverlays from "@/components/ui/GlobalOverlays";
import DesktopAccordionOpener from "@/components/ui/DesktopAccordionOpener";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Analysis Studio",
  description:
    "Analyze uploaded CSV files with automatic schema inference, quality checks, descriptive statistics, visualisations, and optional machine learning.",
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
      className={`${bodyFont.variable} ${displayFont.variable}`}
    >
      <body suppressHydrationWarning className="antialiased">
        {children}
        <DesktopAccordionOpener />
        <Suspense fallback={null}>
          <GlobalOverlays />
        </Suspense>
      </body>
    </html>
  );
}