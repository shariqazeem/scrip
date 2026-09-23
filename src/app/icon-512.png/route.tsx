import { ImageResponse } from "next/og";
import { MARK_NUDGE, MARK_S, MARK_SLICE, MARK_SLICE_LIFT, MARK_STROKE, MARK_VIEWBOX } from "@/components/brand/mark-geometry";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** The manifest's maskable icon: the slice S inside the safe zone, paper to the edge. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f5ef", alignItems: "center", justifyContent: "center" }}>
        <svg width="300" height="300" viewBox={MARK_VIEWBOX} fill="none" strokeWidth={MARK_STROKE} strokeLinecap="butt">
          <g transform={MARK_NUDGE}>
            <path d={MARK_S} stroke="#14161c" />
            <path d={MARK_SLICE} stroke="#2b4acb" transform={MARK_SLICE_LIFT} />
          </g>
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
