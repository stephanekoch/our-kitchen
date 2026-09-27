import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP } from "@/lib/app-config";

export const metadata: Metadata = {
  title: APP.name,
  applicationName: APP.name,
  description: APP.description,
  // iPhone: open full screen from the home screen, with our name under the icon.
  appleWebApp: { capable: true, title: APP.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch and home bar; screens pad with env(safe-area-inset-*)
  themeColor: APP.theme,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: APP.background }}>{children}</body>
    </html>
  );
}
