import { api } from "@/app/lib/api";

const RETRYABLE_UPLOAD_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_UPLOAD_ATTEMPTS = 4;
const INITIAL_UPLOAD_RETRY_DELAY_MS = 500;

export interface DuplicatePhoto {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  s3Key: string;
  distance: number;
}

export type PresignResponse =
  | { status: "ok"; url: string; key: string }
  | { status: "duplicate"; duplicates: DuplicatePhoto[] }
  | { status: "quota_exceeded"; currentUsageBytes: number; limitBytes: number; plan: string };

export type BatchPreflightItem = {
  clientId: string;
  filename: string;
  contentType: string;
  contentLength?: number;
  relativePath?: string;
  storageSubFolder?: "photos" | "videos";
  perceptualHash?: string;
};

export type BatchPreflightResult =
  | { clientId: string; status: "new" }
  | { clientId: string; status: "duplicate"; duplicates: DuplicatePhoto[] }
  | {
      clientId: string;
      status: "quota_exceeded";
      currentUsageBytes: number;
      limitBytes: number;
      plan: string | null;
    };

export type BatchPreflightResponse = {
  results: BatchPreflightResult[];
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const isRetryableUploadError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error.message === "Upload network error" ||
    error.message === "Upload timeout"
  ) {
    return true;
  }

  const statusMatch = error.message.match(/^Upload failed: (\d{3})$/);
  if (!statusMatch) {
    return false;
  }

  return RETRYABLE_UPLOAD_STATUSES.has(Number(statusMatch[1]));
};

const uploadWithXhr = (
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
  contentTypeOverride?: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentTypeOverride ?? file.type);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }
    xhr.onload = () =>
      xhr.status === 200
        ? resolve()
        : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.ontimeout = () => reject(new Error("Upload timeout"));
    xhr.send(file);
  });

export const s3Service = {
  getPresignedURL: (body: {
    filename: string;
    contentType: string;
    imageData?: string;
    contentLength?: number;
    relativePath?: string;
    storageSubFolder?: "photos" | "videos";
  }) => api.post<PresignResponse>("/api/files/upload", body),
  preflightUploads: (items: BatchPreflightItem[]) =>
    api.post<BatchPreflightResponse>("/api/files/preflight", { items }),
  uploadToS3: (
    url: string,
    file: File,
    onProgress?: (percent: number) => void,
    contentTypeOverride?: string,
  ): Promise<void> =>
    (async () => {
      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        try {
          await uploadWithXhr(url, file, onProgress, contentTypeOverride);
          return;
        } catch (error) {
          if (
            attempt === MAX_UPLOAD_ATTEMPTS ||
            !isRetryableUploadError(error)
          ) {
            throw error;
          }

          await wait(
            INITIAL_UPLOAD_RETRY_DELAY_MS * 2 ** (attempt - 1),
          );
        }
      }
    })(),
};
