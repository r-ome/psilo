import { api } from "@/app/lib/api";
import { Photo } from "./photo.service";

export interface Album {
  id: string;
  userId: string;
  name: string;
  createdAt: string | null;
  coverUrls: string[];
}

export interface AlbumWithPhotos extends Album {
  photos: Photo[];
  nextCursor: string | null;
}

export const albumService = {
  createAlbum: (name: string) =>
    api.post<Album>("/api/albums", { name }),
  listAlbums: () =>
    api.get<Album[]>("/api/albums"),
  getAlbum: (albumId: string, cursor?: string) => {
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return api.get<AlbumWithPhotos>(`/api/albums/${albumId}${params}`);
  },
  updateAlbum: (albumId: string, name: string) =>
    api.put<Album>(`/api/albums/${albumId}`, { name }),
  addPhotoToAlbum: (albumId: string, photoId: string) =>
    api.post<{ message: string }>(`/api/albums/${albumId}/photos`, { photoId }),
  removePhotoFromAlbum: (albumId: string, photoId: string) =>
    api.delete<{ message: string }>(`/api/albums/${albumId}/photos/${photoId}`),
  deleteAlbum: (albumId: string) =>
    api.delete<{ message: string }>(`/api/albums?id=${albumId}`),
};
