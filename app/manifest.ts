import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hestia",
    short_name: "Hestia",
    description:
      "A calm meal planner that pairs daily nutrition targets with an AI coach.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ec",
    theme_color: "#1a1a1a",
    categories: ["food", "health", "lifestyle", "productivity"],
    icons: [
      // Auto-served from app/icon.png and app/apple-icon.png
      { src: "/icon.png", sizes: "500x500", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "500x500", type: "image/png", purpose: "any" },
    ],
  };
}
