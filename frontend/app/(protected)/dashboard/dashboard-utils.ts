import { Photo } from "@/app/lib/services/photo.service";

export interface LoadedPage {
  cursor: string | null;
  photos: Photo[];
  nextCursor: string | null;
}

const IN_PROGRESS_STATUSES = new Set<Photo["status"]>(["pending", "processing"]);

export function isPhotoInProgress(photo: Photo) {
  return IN_PROGRESS_STATUSES.has(photo.status);
}

export function getRefreshablePages(pages: LoadedPage[]) {
  return pages.filter((page) => page.photos.some(isPhotoInProgress));
}

export function mergePagesByCursor(
  previousPages: LoadedPage[],
  refreshedPages: LoadedPage[],
) {
  const refreshedByCursor = new Map(
    refreshedPages.map((page) => [page.cursor, page] as const),
  );

  return previousPages.map((page) => refreshedByCursor.get(page.cursor) ?? page);
}

export function flattenPages(pages: LoadedPage[]) {
  const seen = new Set<string>();
  const merged: Photo[] = [];

  for (const page of pages) {
    for (const photo of page.photos) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      merged.push(photo);
    }
  }

  return merged;
}
