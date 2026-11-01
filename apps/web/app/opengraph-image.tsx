import { ImageResponse } from "next/og";

// The card shown when the site link is shared in WhatsApp, email or a report.
export const alt = "CareerQuest: explore what comes after Class 10";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tiles = [
  { label: "Your marks", value: "Confirmed", color: "#ffe694" },
  { label: "Your interests", value: "Compass", color: "#dcd3f5" },
  { label: "Colleges", value: "45,844 courses", color: "#c9eee1" },
  { label: "Your plan", value: "Parent report", color: "#ffd4e8" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#eef0f1",
          color: "#20242c",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#2856e9" />
            <circle cx="32" cy="30" r="18" stroke="#fff" strokeWidth="3" fill="none" />
            <path d="m39 22-4 12-12 4 4-12Z" fill="#fff" />
            <path d="m43 44 9 10" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>CareerQuest</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>
            Your next chapter, your way.
          </span>
          <span style={{ fontSize: 30, color: "#4d5863", marginTop: 20 }}>
            Marks, interests, colleges and a plan for life after Class 10 in Maharashtra.
          </span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {tiles.map((tile) => (
            <div
              key={tile.label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "20px 24px",
                borderRadius: 24,
                background: tile.color,
              }}
            >
              <span style={{ fontSize: 22, color: "#44515b" }}>{tile.label}</span>
              <span style={{ fontSize: 27, fontWeight: 700, marginTop: 6 }}>{tile.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
