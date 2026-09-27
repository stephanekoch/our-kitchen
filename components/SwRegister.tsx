"use client";

import { useEffect } from "react";

/** Registers the offline helper (public/sw.js) so the app opens even with no signal. */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
