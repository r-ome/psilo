import { api } from "@/app/lib/api";

export const s3Service = {
  getPresignedURL: (body: { filename: string; contentType: string }) =>
    api.post<{ url: string; key: string }>("/api/files/upload", body),
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
