import "./stock-logo.css";

/**
 * A STOCK'S LOGO, beside its name, so a list of stocks reads as one at a glance. Decorative: the
 * name is always next to it, so the image says nothing to a screen reader. Served from
 * scrip.work by `/api/stock-logo/<mint>`, which never answers with a broken image.
 */
export function StockLogo({ mint, size = 32, eager = false }: { mint: string; size?: number; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="sp-logo"
      src={`/api/stock-logo/${mint}`}
      alt=""
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
