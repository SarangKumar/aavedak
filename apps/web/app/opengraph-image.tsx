import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Aavedak — Discover · Apply · Grow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
        background: "#090909",
        padding: "64px 72px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          color: "#D4AF37",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 2,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, #D4AF37 0%, #8B7355 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#090909",
            fontSize: 32,
            fontWeight: 800,
          }}
        >
          A
        </div>
        AAVEDAK
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ color: "#F5F5F0", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
          Discover · Apply · Grow
        </div>
        <div style={{ color: "#A3A39A", fontSize: 28, maxWidth: 900, lineHeight: 1.35 }}>
          Job-search OS — roles, documents, tracker, referrals. You decide and send.
        </div>
      </div>
      <div style={{ color: "#6B6B63", fontSize: 22 }}>aavedak.vercel.app · आवेदक</div>
    </div>,
    { ...size },
  );
}
