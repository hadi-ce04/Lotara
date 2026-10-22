import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

// Editorial pairing: Fraunces for display, Public Sans (a public-service typeface)
// for reading, IBM Plex Mono for barcodes and lot codes.
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "SOFT"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Lotara: recall response for nursery kitchens",
  description: "Evidence-backed product-recall response for multi-site nursery kitchens (hackathon prototype).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
