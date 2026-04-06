import type { Photo } from "@/app/lib/services/photo.service";

const EDITED_SUFFIX_PATTERN = /(?:[-_ ]edited)(?:\(\d+\))?$/i;

function splitFilename(filename: string) {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf(".");

  if (lastDot === -1) {
    return { base: trimmed, extension: "" };
  }

  return {
    base: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot + 1),
  };
}

function stripEditedSuffix(base: string): string {
  return base.replace(EDITED_SUFFIX_PATTERN, "");
}

export function isEditedPhotoVersion(filename: string): boolean {
  const { base } = splitFilename(filename);
  return EDITED_SUFFIX_PATTERN.test(base);
}

export function getPhotoVersionGroupKey(filename: string): string {
  const { base, extension } = splitFilename(filename);
  const normalizedBase = stripEditedSuffix(base).toLowerCase();
  const normalizedExtension = extension.toLowerCase();

  return normalizedExtension
    ? `${normalizedBase}.${normalizedExtension}`
    : normalizedBase;
}

export function getRelatedPhotoVersions(
  photos: Photo[],
  target: Photo | null | undefined,
): Photo[] {
  if (!target) return [];

  const targetGroupKey = getPhotoVersionGroupKey(target.filename);
  const targetContentPrefix = target.contentType?.split("/")[0] ?? null;

  return [...photos]
    .filter((photo) => {
      if (getPhotoVersionGroupKey(photo.filename) !== targetGroupKey) {
        return false;
      }

      if (!targetContentPrefix) return true;

      return photo.contentType?.startsWith(`${targetContentPrefix}/`) ?? false;
    })
    .sort((a, b) => {
      const editedWeight = Number(isEditedPhotoVersion(a.filename)) -
        Number(isEditedPhotoVersion(b.filename));
      if (editedWeight !== 0) return editedWeight;

      const aTaken = a.takenAt ?? a.createdAt ?? "";
      const bTaken = b.takenAt ?? b.createdAt ?? "";
      return aTaken.localeCompare(bTaken) || a.filename.localeCompare(b.filename);
    });
}

function getVersionFamilyKey(photo: Photo): string {
  const contentPrefix = photo.contentType?.split("/")[0] ?? "unknown";
  return `${contentPrefix}:${getPhotoVersionGroupKey(photo.filename)}`;
}

function getStatusWeight(status: Photo["status"]) {
  if (status === "completed") return 3;
  if (status === "processing") return 2;
  if (status === "pending") return 1;
  return 0;
}

function comparePreferredVersion(a: Photo, b: Photo) {
  const statusWeight = getStatusWeight(b.status) - getStatusWeight(a.status);
  if (statusWeight !== 0) return statusWeight;

  const editedWeight = Number(isEditedPhotoVersion(b.filename)) -
    Number(isEditedPhotoVersion(a.filename));
  if (editedWeight !== 0) return editedWeight;

  const aTaken = a.takenAt ?? a.createdAt ?? "";
  const bTaken = b.takenAt ?? b.createdAt ?? "";
  return bTaken.localeCompare(aTaken) || a.filename.localeCompare(b.filename);
}

export function getPrimaryPhotoVersions(photos: Photo[]): Photo[] {
  const representatives = new Map<string, Photo>();

  for (const photo of photos) {
    const familyKey = getVersionFamilyKey(photo);
    const existing = representatives.get(familyKey);

    if (!existing || comparePreferredVersion(photo, existing) < 0) {
      representatives.set(familyKey, photo);
    }
  }

  const representativeIds = new Set(
    [...representatives.values()].map((photo) => photo.id),
  );

  return photos.filter((photo) => representativeIds.has(photo.id));
}
