import { MARK_NUDGE, MARK_S, MARK_SLICE, MARK_SLICE_LIFT, MARK_STROKE, MARK_VIEWBOX } from "./mark-geometry";

/**
 * THE ONE SCRIP MARK — the slice S. The S takes the text colour of wherever it sits; the slice
 * takes `--slice`, which is document blue on paper and the lifted blue on the dark ground.
 */
export function ScripMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      fill="none"
      strokeWidth={MARK_STROKE}
      strokeLinecap="butt"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", display: "block" }}
    >
      <g transform={MARK_NUDGE}>
        <path d={MARK_S} stroke="currentColor" />
        <path d={MARK_SLICE} stroke="var(--slice, var(--accent))" transform={MARK_SLICE_LIFT} />
      </g>
    </svg>
  );
}
