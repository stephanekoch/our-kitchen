import type { Supabase } from "./supabase/server";

export const PHOTO_BUCKET = "recipe-photos";
const SIGNED_URL_SECONDS = 60 * 60;

/** Map of photo_path → short-lived signed URL (the bucket is private). */
export async function signPhotos(supabase: Supabase, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) {
    console.error("sign photos", error.message);
    return map;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function removePhoto(supabase: Supabase, path: string | null | undefined) {
  if (!path) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error("remove photo", path, error.message);
}
