/**
 * THE DOCS NAV, in a module of its own with no stylesheet behind it.
 *
 * It lived on the frame component, which imports the reading surface's CSS — and a test that
 * only wants the list then drags a PostCSS config into a test runner that has no business
 * with one. A list of routes is data; keep it importable by anything.
 */
export const DOC_PAGES = [
  { href: "/docs", label: "What Webgold does" },
  { href: "/docs/corporate-actions", label: "Corporate actions" },
  { href: "/docs/receipts", label: "Receipts" },
  { href: "/docs/keep-rate", label: "Keep-rate" },
] as const;
