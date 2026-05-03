import { ImageResponse } from "next/og";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 192,
          background: "#f6f3ec",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1a1a1a",
          fontFamily: "serif",
          fontWeight: 500,
          letterSpacing: "-12px",
        }}
      >
        H
      </div>
    ),
    size,
  );
}
