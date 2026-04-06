import {
  getPrimaryPhotoVersions,
  getPhotoVersionGroupKey,
  getRelatedPhotoVersions,
  isEditedPhotoVersion,
} from "@/app/lib/photo-versions";
import type { Photo } from "@/app/lib/services/photo.service";

function makePhoto(overrides: Partial<Photo>): Photo {
  return {
    id: overrides.id ?? "photo-1",
    userId: overrides.userId ?? "user-1",
    s3Key: overrides.s3Key ?? "users/user-1/photos/photo.jpg",
    thumbnailKey: overrides.thumbnailKey ?? null,
    filename: overrides.filename ?? "photo.jpg",
    size: overrides.size ?? null,
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    format: overrides.format ?? "jpeg",
    contentType: overrides.contentType ?? "image/jpeg",
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

describe("photo versions", () => {
  it("normalizes edited siblings into the same version group", () => {
    expect(getPhotoVersionGroupKey("IMG_145482286860904.jpeg")).toBe(
      "img_145482286860904.jpeg",
    );
    expect(getPhotoVersionGroupKey("IMG_145482286860904-edited.jpeg")).toBe(
      "img_145482286860904.jpeg",
    );
    expect(isEditedPhotoVersion("IMG_145482286860904-edited.jpeg")).toBe(true);
  });

  it("finds related versions for the current photo", () => {
    const original = makePhoto({
      id: "original",
      filename: "IMG_145482286860904.jpeg",
      takenAt: "2014-11-04T15:38:21.000Z",
    });
    const edited = makePhoto({
      id: "edited",
      filename: "IMG_145482286860904-edited.jpeg",
      takenAt: "2014-11-04T15:38:21.000Z",
    });
    const unrelated = makePhoto({
      id: "other",
      filename: "IMG_0002.jpeg",
    });

    expect(getRelatedPhotoVersions([edited, unrelated, original], edited)).toEqual([
      original,
      edited,
    ]);
  });

  it("keeps only the preferred representative for each version group", () => {
    const original = makePhoto({
      id: "original",
      filename: "IMG_145482286860904.jpeg",
    });
    const edited = makePhoto({
      id: "edited",
      filename: "IMG_145482286860904-edited.jpeg",
    });
    const unrelated = makePhoto({
      id: "other",
      filename: "IMG_0002.jpeg",
    });

    expect(getPrimaryPhotoVersions([original, edited, unrelated])).toEqual([
      edited,
      unrelated,
    ]);
  });
});
