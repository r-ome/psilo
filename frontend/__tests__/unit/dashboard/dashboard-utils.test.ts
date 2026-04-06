import {
  flattenPages,
  getRefreshablePages,
  mergePagesByCursor,
  reloadPagesFromStart,
} from "@/app/(protected)/dashboard/dashboard-utils";
import type { Photo } from "@/app/lib/services/photo.service";

function makePhoto(id: string, status: Photo["status"]): Photo {
  return {
    id,
    userId: "u1",
    s3Key: `users/u1/photos/${id}.jpg`,
    thumbnailKey: null,
    previewKey: null,
    filename: `${id}.jpg`,
    size: 10,
    width: 100,
    height: 100,
    format: "jpg",
    contentType: "image/jpeg",
    status,
    storageClass: "STANDARD",
    createdAt: "2026-04-04T00:00:00.000Z",
    takenAt: null,
    deletedAt: null,
    thumbnailUrl: null,
  };
}

describe("dashboard utils", () => {
  it("only refreshes pages with pending work", () => {
    const pages = [
      { cursor: null, nextCursor: "c1", photos: [makePhoto("p1", "completed")] },
      { cursor: "c1", nextCursor: "c2", photos: [makePhoto("p2", "processing")] },
      { cursor: "c2", nextCursor: null, photos: [makePhoto("p3", "completed")] },
    ];

    expect(getRefreshablePages(pages).map((page) => page.cursor)).toEqual(["c1"]);
  });

  it("merges refreshed pages without reordering untouched pages", () => {
    const previousPages = [
      { cursor: null, nextCursor: "c1", photos: [makePhoto("p1", "completed")] },
      { cursor: "c1", nextCursor: "c2", photos: [makePhoto("p2", "processing")] },
      { cursor: "c2", nextCursor: null, photos: [makePhoto("p3", "completed")] },
    ];
    const refreshedPages = [
      {
        cursor: "c1",
        nextCursor: "c2",
        photos: [makePhoto("p2", "completed"), makePhoto("p4", "completed")],
      },
    ];

    const merged = mergePagesByCursor(previousPages, refreshedPages);

    expect(merged[0].photos.map((photo) => photo.id)).toEqual(["p1"]);
    expect(merged[1].photos.map((photo) => photo.id)).toEqual(["p2", "p4"]);
    expect(merged[2].photos.map((photo) => photo.id)).toEqual(["p3"]);
  });

  it("flattens pages while deduplicating photos", () => {
    const pages = [
      { cursor: null, nextCursor: "c1", photos: [makePhoto("p1", "completed")] },
      {
        cursor: "c1",
        nextCursor: null,
        photos: [makePhoto("p1", "completed"), makePhoto("p2", "completed")],
      },
    ];

    expect(flattenPages(pages).map((photo) => photo.id)).toEqual(["p1", "p2"]);
  });

  it("reloads the current number of pages from the start to avoid stale cursors", async () => {
    const listPhotos = vi
      .fn()
      .mockResolvedValueOnce({
        photos: [makePhoto("new-1", "completed"), makePhoto("new-2", "completed")],
        nextCursor: "next-page",
      })
      .mockResolvedValueOnce({
        photos: [makePhoto("old-1", "completed"), makePhoto("old-2", "completed")],
        nextCursor: null,
      });

    const pages = await reloadPagesFromStart(2, listPhotos);

    expect(listPhotos).toHaveBeenNthCalledWith(1, undefined);
    expect(listPhotos).toHaveBeenNthCalledWith(2, "next-page");
    expect(pages.map((page) => page.cursor)).toEqual([null, "next-page"]);
    expect(pages[0]?.photos.map((photo) => photo.id)).toEqual(["new-1", "new-2"]);
    expect(pages[1]?.photos.map((photo) => photo.id)).toEqual(["old-1", "old-2"]);
  });
});
