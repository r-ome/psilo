/**
 * Browser-only utility. Downscales an image file to 200×200 using canvas
 * and returns a base64-encoded JPEG string suitable for pHash computation.
 * Returns null for non-image files or files larger than 8 MB.
 */
export async function getImageDataForHash(
  file: File,
  maxDim = 200,
  maxRawBytes = 8 * 1024 * 1024,
): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > maxRawBytes) return null;

  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      // Export as JPEG base64 (strip the data URL prefix)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.split(",")[1] ?? null;
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}
