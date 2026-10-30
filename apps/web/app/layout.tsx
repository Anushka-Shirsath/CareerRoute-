import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./astryx-inspired.css";
import "./bright-dashboard.css";
import "./mentor-widget.css";
import "./festival-game.css";
import "./college-search.css";
import "./college-details.css";
import "./shortlist.css";
import { WorkspaceProvider } from "../src/context";

export const metadata: Metadata = {
  title: "CareerQuest · Your next chapter",
  description:
    "Explore what comes after Class 10. Understand your marks, discover your interests, and find source-linked colleges across Maharashtra.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef0f1",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}

