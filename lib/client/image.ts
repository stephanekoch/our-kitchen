/**
 * Shrink a photo on the phone before upload: max 1600px on the long side, JPEG.
 * Keeps uploads well under Vercel's 4.5 MB limit and converts iPhone HEIC to JPEG.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("encode failed");
    return blob;
  } catch {
    throw new Error("Couldn't read that photo — try a different one");
  } finally {
    URL.revokeObjectURL(url);
  }
}
