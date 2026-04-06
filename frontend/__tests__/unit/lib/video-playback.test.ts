import {
  getPreferredVideoPlaybackSource,
  isBrowserSafeVideoContentType,
} from "@/app/lib/video-playback";
import type { Photo } from "@/app/lib/services/photo.service";

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: overrides.id ?? "photo-1",
    userId: overrides.userId ?? "user-1",
    s3Key: overrides.s3Key ?? "users/user-1/videos/video.mov",
    thumbnailKey: overrides.thumbnailKey ?? null,
    filename: overrides.filename ?? "video.mov",
    size: overrides.size ?? null,
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    format: overrides.format ?? null,
    contentType: overrides.contentType ?? "video/quicktime",
    status: overrides.status ?? "completed",
    storageClass: overrides.storageClass ?? "STANDARD",
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    takenAt: overrides.takenAt ?? null,
    deletedAt: overrides.deletedAt ?? null,
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    previewUrl: overrides.previewUrl ?? null,
    signedUrl: overrides.signedUrl,
  };
}

describe("video playback", () => {
  it("treats mp4, webm, and ogg as browser-safe video types", () => {
    expect(isBrowserSafeVideoContentType("video/mp4")).toBe(true);
    expect(isBrowserSafeVideoContentType("video/webm")).toBe(true);
    expect(isBrowserSafeVideoContentType("video/ogg")).toBe(true);
    expect(isBrowserSafeVideoContentType("video/quicktime")).toBe(false);
    expect(isBrowserSafeVideoContentType("video/x-msvideo")).toBe(false);
  });

  it("uses the original upload for browser-safe videos", () => {
    const source = getPreferredVideoPlaybackSource(
      makePhoto({
        contentType: "video/mp4",
        signedUrl: "https://example.com/original.mp4",
        previewUrl: "https://example.com/preview.mp4",
      }),
    );

    expect(source).toEqual({
      src: "https://example.com/original.mp4",
      type: "video/mp4",
      usesPreview: false,
    });
  });

  it("uses the transcoded preview for unsupported video types", () => {
    const source = getPreferredVideoPlaybackSource(
      makePhoto({
        contentType: "video/quicktime",
        signedUrl: "https://example.com/original.mov",
        previewUrl: "https://example.com/preview.mp4",
      }),
    );

    expect(source).toEqual({
      src: "https://example.com/preview.mp4",
      type: "video/mp4",
      usesPreview: true,
    });
  });

  it("uses the preview for Glacier videos", () => {
    const source = getPreferredVideoPlaybackSource(
      makePhoto({
        storageClass: "GLACIER",
        signedUrl: "https://example.com/original.mov",
        previewUrl: "https://example.com/preview.mp4",
      }),
    );

    expect(source).toEqual({
      src: "https://example.com/preview.mp4",
      type: "video/mp4",
      usesPreview: true,
    });
  });

  it("falls back to the original upload when no preview exists", () => {
    const source = getPreferredVideoPlaybackSource(
      makePhoto({
        contentType: "video/3gpp",
        signedUrl: "https://example.com/original.3gp",
        previewUrl: null,
      }),
    );

    expect(source).toEqual({
      src: "https://example.com/original.3gp",
      type: "video/3gpp",
      usesPreview: false,
    });
  });
});
