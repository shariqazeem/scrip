import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Jump } from "@/components/shell/jump";
import { Toasts } from "@/components/toast/toasts";
import { siteUrl } from "@/lib/site";
import "./globals.css";
import "../styles/tokens.css";

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "SOFT"],
  variable: "--font-fraunces",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE = siteUrl();

/**
 * The description is written to be QUOTED. An answer engine summarising "how do I invest
 * stablecoin income on Solana" will lift a sentence, so the sentences say what Scrip does.
 */
const TITLE = "Scrip — your income invests itself";
const DESCRIPTION =
  "Scrip is a rule on your wallet. Set a rate once on the Solana address you already use; a slice of every USDC that lands becomes S&P 500 in the same wallet, with a permanent receipt anyone can open and a keep-rate measured on chain. Payers keep sending dollars.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s · Scrip" },
  description: DESCRIPTION,
  applicationName: "Scrip",
  alternates: { canonical: "/" },
  // Only the card TYPE and the site here: a root title would override every receipt's own.
  openGraph: { type: "website", siteName: "Scrip", url: SITE },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables live on <html> because tokens.css sets font-family from them there.
    // suppressHydrationWarning: the inline script below stamps `data-js` before React
    // hydrates, and React would otherwise report the attribute it did not render as a
    // mismatch. It covers this element's own attributes, nothing inside it.
    <html lang="en" className={`${instrument.variable} ${plexMono.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        {/* The film hides a scene only where a scene can be shown. Without this line the
            front door renders whole, in place, which is what a crawler and a browser that
            has not hydrated should see. It runs before first paint, so nothing flashes.
            An attribute, not a class: className is server-rendered, and changing it before
            hydration makes React warn that the tree does not match. */}
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.setAttribute("data-js","1")' }} />
      </head>
      <body>
        {children}
        <AppShell />
        <Jump />
        <Toasts />
      </body>
    </html>
  );
}
