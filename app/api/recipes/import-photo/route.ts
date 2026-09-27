import { randomUUID } from "node:crypto";
import { requireHousehold } from "@/lib/context";
import { toDraft } from "@/lib/draft";
import { extractFromPhotos, type ImageInput } from "@/lib/extract/claude";
import { handle, HttpError, ok } from "@/lib/http";
import { PHOTO_BUCKET, signPhotos } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 3;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // Vercel's body limit is 4.5 MB; the client downsizes first
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * POST /api/recipes/import-photo  (multipart/form-data, field "photo", up to 3 pages)
 * Claude reads the photo(s); the first one is kept as the recipe's picture.
 * Returns an unsaved draft with photo_path set.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Send the photo as multipart/form-data");
  }
  const files = form.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new HttpError(400, "Add a photo of the recipe");
  if (files.length > MAX_FILES) throw new HttpError(400, `Up to ${MAX_FILES} photos per recipe`);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new HttpError(413, "Photos are too large — they should be resized before upload");
  for (const f of files) {
    if (!TYPES.has(f.type)) throw new HttpError(415, "Use a JPEG, PNG, WebP or GIF photo (iPhone HEIC photos need converting)");
  }

  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const images: ImageInput[] = buffers.map((b, i) => ({
    data: b.toString("base64"),
    media_type: files[i]!.type as ImageInput["media_type"],
  }));

  // Read first: nothing is stored if there's no recipe in the photo.
  const recipe = await extractFromPhotos(images);

  const cover = files[0]!;
  const photoPath = `${householdId}/${randomUUID()}.${EXT[cover.type]}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(photoPath, buffers[0]!, { contentType: cover.type, upsert: false });

  let savedPath: string | null = photoPath;
  if (uploadError) {
    // The recipe text is what matters; carry on without the picture.
    console.error("photo upload", uploadError.message);
    savedPath = null;
  }
  const signed = await signPhotos(supabase, [savedPath]);

  return ok({
    method: "ai",
    ...toDraft(recipe, { source_type: "photo", photo_path: savedPath }),
    photo_url: savedPath ? (signed.get(savedPath) ?? null) : null,
  });
});
