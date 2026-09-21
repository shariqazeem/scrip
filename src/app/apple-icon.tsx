import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: the stub glyph on paper, no transparency (iOS paints black behind it). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f5ef", alignItems: "center", justifyContent: "center" }}>
        <svg width="132" height="132" viewBox="0 0 24 24" fill="none" stroke="#14161c" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M8.25 5v14" strokeDasharray="1.4 2.1" />
          <path d="M11.5 9.75h5.25" />
          <path d="M11.5 14.25h3.25" />
        </svg>
      </div>
    ),
    size,
  );
}
