import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/Confirm";
import { SwRegister } from "@/components/SwRegister";
import { APP } from "@/lib/app-config";
import "./globals.css";

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
  interactiveWidget: "resizes-content", // Android: the page shrinks above the keyboard instead of sliding under it
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Fraunces:opsz,wght@9..144,600&display=swap"
        />
      </head>
      <body>
        <ConfirmProvider>{children}</ConfirmProvider>
        <SwRegister />
      </body>
    </html>
  );
}
