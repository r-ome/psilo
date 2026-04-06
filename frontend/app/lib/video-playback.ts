import type { Photo } from "@/app/lib/services/photo.service";

const NATIVE_BROWSER_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

function normalizeContentType(contentType: string | null | undefined) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? null;
}

export function isBrowserSafeVideoContentType(
  contentType: string | null | undefined,
) {
  const normalizedContentType = normalizeContentType(contentType);
  if (!normalizedContentType) return false;

  return NATIVE_BROWSER_VIDEO_TYPES.has(normalizedContentType);
}

export function getPreferredVideoPlaybackSource(
  photo: Pick<Photo, "contentType" | "previewUrl" | "signedUrl" | "storageClass">,
) {
  const normalizedContentType = normalizeContentType(photo.contentType);

  if (photo.storageClass === "GLACIER") {
    return photo.previewUrl
      ? { src: photo.previewUrl, type: "video/mp4", usesPreview: true }
      : null;
  }

  if (photo.signedUrl && isBrowserSafeVideoContentType(normalizedContentType)) {
    return {
      src: photo.signedUrl,
      type: normalizedContentType ?? undefined,
      usesPreview: false,
    };
  }

  if (photo.previewUrl) {
    return { src: photo.previewUrl, type: "video/mp4", usesPreview: true };
  }

  if (photo.signedUrl) {
    return {
      src: photo.signedUrl,
      type: normalizedContentType ?? undefined,
      usesPreview: false,
    };
  }

  return null;
}
