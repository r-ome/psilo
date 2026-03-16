import { api } from "@/app/lib/api";

export interface DuplicatePhoto {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  s3Key: string;
  distance: number;
}

export type PresignResponse =
  | { status: "ok"; url: string; key: string }
  | { status: "duplicate"; duplicates: DuplicatePhoto[] };

export const s3Service = {
  getPresignedURL: (body: {
    filename: string;
    contentType: string;
    imageData?: string;
  }) => api.post<PresignResponse>("/api/files/upload", body),
  uploadToS3: (
    url: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () =>
        xhr.status === 200
          ? resolve()
          : reject(new Error(`Upload failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(file);
    });
  },
};
