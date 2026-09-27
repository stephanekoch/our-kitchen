// Tiny localStorage cache so screens open instantly (and offline) with the last data seen.
export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`pc:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(`pc:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, just without the offline copy.
  }
}

export async function clearAllCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pc:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    navigator.serviceWorker?.controller?.postMessage("clear");
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
}
