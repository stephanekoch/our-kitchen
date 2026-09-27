import type { MetadataRoute } from "next";
import { APP } from "@/lib/app-config";

// Served at /manifest.webmanifest. This is what makes "Add to Home Screen" install a
// full-screen app with our name and icon on both iPhone and Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP.name,
    short_name: APP.shortName,
    description: APP.description,
    lang: "en-GB",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: APP.background,
    theme_color: APP.theme,
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
