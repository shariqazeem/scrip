/**
 * THE DOCS NAV, in a module of its own with no stylesheet behind it, so a test can import
 * the list and compare it with the pages on disk.
 */
export const DOC_PAGES = [
  { href: "/docs", label: "What Scrip does" },
  { href: "/docs/how-the-rule-sees-money", label: "How the rule sees money" },
  { href: "/docs/keepers", label: "What a keeper can and cannot do" },
  { href: "/docs/receipts", label: "Receipts" },
  { href: "/docs/keep-rate", label: "Keep-rate" },
  { href: "/docs/corporate-actions", label: "Corporate actions" },
] as const;
