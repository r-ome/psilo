import { api } from "@/app/lib/api";

export interface GroupedPhotosByDate {
  date: string;
  photos: Photo[];
}

export interface Photo {
  id: string;
  userId: string;
  s3Key: string;
  filename: string;
  size: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  contentType: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string | null;
  takenAt: string | null;
  signedUrl: string;
}

export interface PaginatedPhotos {
  photos: Photo[];
  nextCursor: string | null;
}

export const photoService = {
  listPhotos: (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    return api.get<PaginatedPhotos>(`/api/photos${params.toString() ? `?${params}` : ""}`);
  },
  deletePhoto: (key: string) =>
    api.delete<{ message: string }>(
      `/api/photos?key=${encodeURIComponent(key)}`,
    ),
  updatePhotoTakenAt: (key: string, takenAt: string | null) =>
    api.patch<Photo>(`/api/photos?key=${encodeURIComponent(key)}`, { takenAt }),
};
