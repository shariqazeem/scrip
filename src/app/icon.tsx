import { ImageResponse } from "next/og";
import { MARK_NUDGE, MARK_S, MARK_SLICE, MARK_SLICE_LIFT, MARK_STROKE, MARK_VIEWBOX } from "@/components/brand/mark-geometry";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** THE FAVICON IS THE SLICE S: ink on paper, the slice in document blue. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f5ef", borderRadius: 7, alignItems: "center", justifyContent: "center" }}>
        <svg width="28" height="28" viewBox={MARK_VIEWBOX} fill="none" strokeWidth={MARK_STROKE} strokeLinecap="butt">
          <g transform={MARK_NUDGE}>
            <path d={MARK_S} stroke="#14161c" />
            <path d={MARK_SLICE} stroke="#2b4acb" transform={MARK_SLICE_LIFT} />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
