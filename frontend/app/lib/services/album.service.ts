import { api } from "@/app/lib/api";
import { Photo } from "./photo.service";

export interface Album {
  id: string;
  userId: string;
  name: string;
  createdAt: string | null;
  coverUrl: string | null;
}

export interface AlbumWithPhotos extends Album {
  photos: Photo[];
}

export const albumService = {
  createAlbum: (name: string) =>
    api.post<Album>("/api/albums", { name }),
  listAlbums: () =>
    api.get<Album[]>("/api/albums"),
  getAlbum: (albumId: string) =>
    api.get<AlbumWithPhotos>(`/api/albums/${albumId}`),
  updateAlbum: (albumId: string, name: string) =>
    api.put<Album>(`/api/albums/${albumId}`, { name }),
  addPhotoToAlbum: (albumId: string, photoId: string) =>
    api.post<{ message: string }>(`/api/albums/${albumId}/photos`, { photoId }),
  removePhotoFromAlbum: (albumId: string, photoId: string) =>
    api.delete<{ message: string }>(`/api/albums/${albumId}/photos/${photoId}`),
  deleteAlbum: (albumId: string) =>
    api.delete<{ message: string }>(`/api/albums?id=${albumId}`),
};
