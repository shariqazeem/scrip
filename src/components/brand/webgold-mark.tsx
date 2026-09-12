/**
 * THE ONE WEBGOLD MARK — a bullion stack, drawn in the same line register as the
 * lucide icons beside it so the rail reads as one set rather than a logo pasted into
 * an icon column.
 *
 * It is stroke-on-currentColor, not an image: the rail, the landing nav, the receipt
 * header and the docs sidebar all tint it from their own text colour, so it survives
 * the one dark section without a second asset.
 */
export function WebgoldMark({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", display: "block" }}
    >
      {/* the bar on top, set back */}
      <path d="M9 4.4H15L16.4 9.5H7.6Z" />
      {/* the bar it rests on */}
      <path d="M6 12.3H18L19.6 18.4H4.4Z" />
    </svg>
  );
}
