import { randomUUID } from "node:crypto";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok } from "@/lib/http";
import { PHOTO_BUCKET, removePhoto, signPhotos } from "@/lib/photos";
import { uuid } from "@/lib/recipe-schema";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** POST /api/recipes/:id/photo (multipart, field "photo") — replace the recipe's picture. */
export const POST = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { supabase, householdId } = await requireHousehold();
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Recipe not found");

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Add a photo");
  if (!TYPES[file.type]) throw new HttpError(415, "Use a JPEG, PNG, WebP or GIF photo");
  if (file.size > 4 * 1024 * 1024) throw new HttpError(413, "That photo is too large");

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("id,photo_path")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!recipe) throw new HttpError(404, "Recipe not found");

  const path = `${householdId}/${randomUUID()}.${TYPES[file.type]}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (uploadError) throw new HttpError(502, "Couldn't store the photo — try again");

  const { error: updateError } = await supabase.from("recipes").update({ photo_path: path }).eq("id", id);
  if (updateError) {
    await removePhoto(supabase, path);
    throw dbError(updateError);
  }
  await removePhoto(supabase, recipe.photo_path as string | null);

  const signed = await signPhotos(supabase, [path]);
  return ok({ photo_url: signed.get(path) ?? null });
});
