import { ImageResponse } from "next/og";
import { MARK_NUDGE, MARK_S, MARK_SLICE, MARK_SLICE_LIFT, MARK_STROKE, MARK_VIEWBOX } from "@/components/brand/mark-geometry";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: the slice S on paper, no transparency (iOS paints black behind it). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f5ef", alignItems: "center", justifyContent: "center" }}>
        <svg width="124" height="124" viewBox={MARK_VIEWBOX} fill="none" strokeWidth={MARK_STROKE} strokeLinecap="butt">
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
