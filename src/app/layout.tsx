import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { siteUrl } from "@/lib/site";
import "./globals.css";
import "../styles/tokens.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const SITE = siteUrl();

/**
 * The description is written to be QUOTED, not merely crawled. An answer engine summarising
 * "how do I get paid in gold on Solana" will lift a sentence, so the sentences say what
 * Webgold does, what lands where, and what a reader can open and check.
 */
const TITLE = "Webgold — ownership you receive, in grams";
const DESCRIPTION =
  "Webgold is a receive book for real assets on Solana. Value arrives as gold, silver and the market — in your own wallet, never ours — because you earned it, were gifted it, or were sponsored into it. Every arrival carries an on-chain receipt anyone can open: who paid, who received, how many grams, and why.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: TITLE,
    // Page titles read "Assets · Webgold" rather than each page inventing its own suffix.
    template: "%s · Webgold",
  },
  description: DESCRIPTION,
  applicationName: "Webgold",
  alternates: { canonical: "/" },
  // The root sets only the card TYPE and site. An explicit root openGraph/twitter title
  // overrides every page's own (Next merges per top-level key), which is how a shared
  // receipt link ends up showing the homepage's SEO string instead of the arrival.
  openGraph: { type: "website", siteName: "Webgold", url: SITE },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables live on <html> because tokens.css sets font-family from them on
    // <html>; defining them on <body> leaves the root family unresolved and the page falls
    // back to the browser's default serif.
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <AppShell />
      </body>
    </html>
  );
}
