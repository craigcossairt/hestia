import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 140,
          background: "#1a1a1a",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f6f3ec",
          fontFamily: "serif",
          fontWeight: 500,
          letterSpacing: "-8px",
          borderRadius: 38,
        }}
      >
        H
      </div>
    ),
    size,
  );
}
