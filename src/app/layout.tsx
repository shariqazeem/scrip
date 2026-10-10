import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
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
// Fraunces appears only in the wordmark (and a statement's title), always at optical size 144,
// weight 700, softness 30. So it is pinned to that one style and cut to Latin text: 11 KB in place
// of the 120 KB variable font that was preloaded on every page (Lighthouse, 8 Oct). Made with
// fontTools' instancer and subsetter from Google Fonts' Fraunces; SIL OFL 1.1, ./fonts/OFL-Fraunces.txt.
const fraunces = localFont({
  src: "./fonts/fraunces-wordmark.woff2",
  weight: "700",
  style: "normal",
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
  "Scrip turns money moving on Solana into stocks people own. Say yes once, and a slice of every USDC payment into your wallet becomes stock such as the Nasdaq 100 or the S&P 500, by itself, in the same wallet, with a public receipt read from the chain. Whoever pays you can match it with a Plan the program enforces, and every token launched on Scrip Curve, priced in a stock on Meteora, pays a share of its trading fees into those matches.";

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
        {/* And a browser whose wallet already saves (remembered by the start card) is marked,
            so the front door holds its start sentence back instead of flashing it for the
            second it takes to read the wallet and say "you save 10% of every payment". */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'document.documentElement.setAttribute("data-js","1");try{if(localStorage.getItem("scrip:saving"))document.documentElement.setAttribute("data-saving","1")}catch(e){}',
          }}
        />
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
