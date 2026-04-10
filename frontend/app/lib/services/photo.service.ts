import { api } from "@/app/lib/api";

export interface GroupedPhotosByDate {
  date: string;
  photos: Photo[];
}

export interface Photo {
  id: string;
  userId: string;
  s3Key: string;
  thumbnailKey: string | null;
  previewKey?: string | null;
  filename: string;
  size: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  contentType: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  storageClass: "STANDARD" | "GLACIER";
  createdAt: string | null;
  takenAt: string | null;
  deletedAt?: string | null;
  thumbnailUrl: string | null;
  previewUrl?: string | null;
  signedUrl?: string;
}

export interface PaginatedPhotos {
  photos: Photo[];
  nextCursor: string | null;
}

export interface StorageSize {
  standardSize: number; // bytes
  glacierSize: number; // bytes
  thumbnailSize: number; // bytes
  standardCount: number; // number of standard files
  glacierCount: number; // number of glacier files
  standardPhotoCount: number; // photos in standard
  standardVideoCount: number; // videos in standard
  glacierPhotoCount: number; // photos in glacier
  glacierVideoCount: number; // videos in glacier
  retrievalSizeByTier: Record<string, number>; // bytes per retrieval tier
}

export interface RetryFailedPhotosResponse {
  message: string;
  queuedCount: number;
  missingCount: number;
}

export const photoService = {
  listPhotos: (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    return api.get<PaginatedPhotos>(`/api/photos${params.toString() ? `?${params}` : ""}`);
  },
  listTrashPhotos: (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    return api.get<PaginatedPhotos>(`/api/photos/trash${params.toString() ? `?${params}` : ""}`);
  },
  deletePhoto: (key: string) =>
    api.delete<{ message: string }>(
      `/api/photos?key=${encodeURIComponent(key)}`,
    ),
  deletePhotos: (keys: string[]) =>
    api.delete<{ message: string }>("/api/photos", { keys }),
  restorePhotos: (keys: string[]) =>
    api.post<{ message: string }>("/api/photos/trash/restore", { keys }),
  permanentlyDeletePhotos: (keys: string[]) =>
    api.delete<{ message: string; count: number }>("/api/photos/trash", { keys }),
  updatePhotoTakenAt: (key: string, takenAt: string | null) =>
    api.patch<Photo>(`/api/photos?key=${encodeURIComponent(key)}`, { takenAt }),
  updatePhotosTakenAt: (keys: string[], takenAt: string | null) =>
    api.patch<{ message: string }>("/api/photos", { keys, takenAt }),
  retryFailedPhotos: (keys: string[]) =>
    api.post<RetryFailedPhotosResponse>("/api/photos/retry-failed", { keys }),
  getStorageSize: (): Promise<StorageSize> =>
    api.get<StorageSize>("/api/photos/storage-size"),
};
