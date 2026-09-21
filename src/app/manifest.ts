import type { MetadataRoute } from "next";

/**
 * INSTALLABLE. A register on a phone's home screen opens straight to the moment, in paper,
 * with the stub glyph as its icon. Nothing here is offline: every figure is read from chain.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scrip",
    short_name: "Scrip",
    description: "A rule on your wallet: a slice of every dollar that lands becomes stock, in the same wallet, with a receipt.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#14161c",
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
