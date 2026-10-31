import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";
import DataRain from "@/components/ui/data-rain";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "BrandLint: pre-publish brand checks that cite their source",
  description:
    "BrandLint reviews posts, banners and PDFs against your own brand guideline, approved facts and terminology before they go live. Every finding cites the clause it comes from.",
};

export const viewport: Viewport = { themeColor: "#0a0b14" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen overflow-x-hidden antialiased">
        <DataRain theme="light" count={1800} />
        <Suspense fallback={<div className="py-24 text-center text-sm text-[#5e5b78]">Loading BrandLint…</div>}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
