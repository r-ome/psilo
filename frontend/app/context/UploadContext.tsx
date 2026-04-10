"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  s3Service,
  type BatchPreflightItem,
  type BatchPreflightResult,
  type DuplicatePhoto,
} from "@/app/lib/services/s3.service";
import { api } from "@/app/lib/api";
import { getImageHashData, hammingDistance } from "@/app/lib/utils/image-hash";
import {
  buildGoogleTakeoutImportPlan,
  type GoogleTakeoutImportItem,
} from "@/app/lib/google-takeout";
import DuplicateUploadModal from "@/app/(protected)/components/DuplicateUploadModal";

interface PendingDuplicate {
  file: File;
  duplicate: DuplicatePhoto;
  previewSrc?: string;
  resolve: (decision: {
    action: "keepBoth" | "skip" | "replace";
    applyToRest: boolean;
  }) => void;
  cleanup?: () => void;
}

type UploadContextValue = {
  isUploading: boolean;
  totalFiles: number;
  completedFiles: number;
  activeUploads: number;
  activeUploadNames: Record<string, string>;
  currentFileName: string | null;
  fileSizes: Record<string, number>;
  fileProgresses: Record<string, number>;
  uploadStartedAt: number | null;
  failedUploads: FailedUploadItem[];
  startUpload: (files: File[]) => void;
  startGoogleTakeoutUpload: (files: File[]) => void;
  retryUpload: (itemId: string) => void;
  retryFailedUploads: () => void;
};

const initialValue: UploadContextValue = {
  isUploading: false,
  totalFiles: 0,
  completedFiles: 0,
  activeUploads: 0,
  activeUploadNames: {},
  currentFileName: null,
  fileSizes: {},
  fileProgresses: {},
  uploadStartedAt: null,
  failedUploads: [],
  startUpload: () => {},
  startGoogleTakeoutUpload: () => {},
  retryUpload: () => {},
  retryFailedUploads: () => {},
};

const UploadContext = createContext<UploadContextValue>(initialValue);

type UploadItem = {
  id: string;
  file: File;
};

type ReviewedUpload = {
  item: UploadItem;
  uploadFilename: string;
};

export type FailedUploadItem = {
  itemId: string;
  filename: string;
  errorMessage: string;
  attempts: number;
};

type RegularRetryCandidate = {
  kind: "regular";
  itemId: string;
  file: File;
  uploadFilename: string;
  attempts: number;
};

type TakeoutRetryCandidate = {
  kind: "takeout";
  itemId: string;
  file: File;
  takeoutUpload: ApprovedTakeoutUpload;
  attempts: number;
};

type RetryCandidate = RegularRetryCandidate | TakeoutRetryCandidate;

type ApprovedBatchImage = {
  item: UploadItem;
  uploadFilename: string;
  perceptualHash: string;
};

type ApprovedTakeoutUpload = {
  item: GoogleTakeoutImportItem;
  uploadRelativePath: string;
  sidecarUploadRelativePath: string | null;
};

type PreparedTakeoutItem = {
  item: GoogleTakeoutImportItem;
  hashData: {
    imageData: string;
    perceptualHash: string;
  } | null;
};

type ApprovedBatchTakeoutImage = {
  itemId: string;
  file: File;
  uploadRelativePath: string;
  perceptualHash: string;
};

const SAME_BATCH_DUPLICATE_THRESHOLD = 10;
const UPLOAD_POOL_CONCURRENCY = 8;
const PREFLIGHT_BATCH_SIZE = 10;

function isUploadTimingEnabled() {
  if (typeof window === "undefined") return false;

  return (
    window.localStorage.getItem("psilo:uploadTiming") === "1" ||
    window.location.search.includes("uploadTiming=1")
  );
}

function logUploadTiming(label: string, details: Record<string, number | string>) {
  if (!isUploadTimingEnabled()) return;
  console.info("[upload-timing]", label, details);
}

function createUploadPool(concurrency: number) {
  const queue: Array<() => Promise<void>> = [];
  let running = 0;
  let resolveIdle: (() => void) | null = null;

  const tryNext = () => {
    while (running < concurrency && queue.length > 0) {
      const task = queue.shift()!;
      running++;
      task().finally(() => {
        running--;
        tryNext();
        if (running === 0 && queue.length === 0 && resolveIdle) {
          resolveIdle();
          resolveIdle = null;
        }
      });
    }
  };

  return {
    enqueue(task: () => Promise<void>) {
      queue.push(task);
      tryNext();
    },
    drain(): Promise<void> {
      if (running === 0 && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => {
        resolveIdle = resolve;
      });
    },
  };
}

function uniqueFilename(filename: string, existingFilenames: string[]): string {
  if (!existingFilenames.includes(filename)) return filename;
  const lastDot = filename.lastIndexOf(".");
  const base = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot !== -1 ? filename.slice(lastDot) : "";
  let counter = 1;
  while (existingFilenames.includes(`${base}_${counter}${ext}`)) counter++;
  return `${base}_${counter}${ext}`;
}

function uniqueRelativePath(
  relativePath: string,
  existingRelativePaths: string[],
): string {
  const segments = relativePath.split("/");
  const filename = segments.pop() ?? relativePath;
  const directory = segments.join("/");
  const existingFilenames = existingRelativePaths
    .filter((value) => {
      const valueSegments = value.split("/");
      valueSegments.pop();
      return valueSegments.join("/") === directory;
    })
    .map((value) => value.split("/").pop() ?? value);

  const uniqueName = uniqueFilename(filename, existingFilenames);
  return directory ? `${directory}/${uniqueName}` : uniqueName;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createImportId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;

  return `takeout-${Date.now()}`;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [isUploading, setIsUploading] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [completedFiles, setCompletedFiles] = useState(0);
  const [activeUploads, setActiveUploads] = useState(0);
  const [activeUploadNames, setActiveUploadNames] = useState<Record<string, string>>({});
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});
  const [fileProgresses, setFileProgresses] = useState<Record<string, number>>(
    {},
  );
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedUploadItem[]>([]);
  const [pendingDuplicate, setPendingDuplicate] =
    useState<PendingDuplicate | null>(null);
  const isUploadingRef = useRef(false);
  const failedUploadCandidatesRef = useRef<Record<string, RetryCandidate>>({});
  const duplicateDecisionForRestRef = useRef<"keepBoth" | "skip" | "replace" | null>(null);

  const askAboutDuplicate = useCallback((
    file: File,
    duplicate: DuplicatePhoto,
    previewSrc?: string,
    cleanup?: () => void,
  ): Promise<{ action: "keepBoth" | "skip" | "replace"; applyToRest: boolean }> => {
    return new Promise((resolve) => {
      setPendingDuplicate({ file, duplicate, previewSrc, resolve, cleanup });
    });
  }, []);

  const handleDuplicateResolved = (
    action: "keepBoth" | "skip" | "replace",
    applyToRest: boolean,
  ) => {
    if (pendingDuplicate) {
      pendingDuplicate.resolve({ action, applyToRest });
      pendingDuplicate.cleanup?.();
      setPendingDuplicate(null);
    }
  };

  const resolveDuplicateAction = useCallback(
    async (
      file: File,
      duplicate: DuplicatePhoto,
      previewSrc?: string,
      cleanup?: () => void,
    ): Promise<"keepBoth" | "skip" | "replace"> => {
      const bulkAction = duplicateDecisionForRestRef.current;
      if (bulkAction) {
        cleanup?.();
        return bulkAction;
      }

      const decision = await askAboutDuplicate(file, duplicate, previewSrc, cleanup);
      if (decision.applyToRest) {
        duplicateDecisionForRestRef.current = decision.action;
      }
      return decision.action;
    },
    [askAboutDuplicate],
  );

  const markUploadComplete = useCallback((itemId: string) => {
    setFileProgresses((prev) => ({ ...prev, [itemId]: 100 }));
    setCompletedFiles((prev) => prev + 1);
  }, []);

  const uploadMediaWithProgress = useCallback(
    async (
      itemId: string,
      file: File,
      presignedUrl: string,
      contentType: string,
    ) => {
      setCurrentFileName(file.name);
      setUploadStartedAt((prev) => prev ?? Date.now());
      setFileSizes((prev) => ({ ...prev, [itemId]: file.size }));
      setActiveUploads((prev) => prev + 1);
      setActiveUploadNames((prev) => ({ ...prev, [itemId]: file.name }));

      try {
        await s3Service.uploadToS3(
          presignedUrl,
          file,
          (percent) =>
            setFileProgresses((prev) => ({ ...prev, [itemId]: percent })),
          contentType,
        );
      } finally {
        setActiveUploads((prev) => Math.max(prev - 1, 0));
        setActiveUploadNames((prev) => {
          if (!(itemId in prev)) {
            return prev;
          }

          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    },
    [],
  );

  const clearUploadFailure = useCallback((itemId: string) => {
    delete failedUploadCandidatesRef.current[itemId];
    setFailedUploads((prev) => prev.filter((failed) => failed.itemId !== itemId));
  }, []);

  const uploadApprovedTakeoutItem = useCallback(
    async (upload: ApprovedTakeoutUpload) => {
      const { item, uploadRelativePath, sidecarUploadRelativePath } = upload;

      if (item.sidecarFile && sidecarUploadRelativePath) {
        const sidecarPresignResult = await s3Service.getPresignedURL({
          filename: item.sidecarFile.name,
          contentType: "application/json",
          contentLength: item.sidecarFile.size,
          relativePath: sidecarUploadRelativePath,
          storageSubFolder: item.storageSubFolder,
        });

        if (sidecarPresignResult.status !== "ok") {
          throw new Error(`Failed to get upload URL for ${item.sidecarFile.name}`);
        }

        await s3Service.uploadToS3(
          sidecarPresignResult.url,
          item.sidecarFile,
          undefined,
          "application/json",
        );
      }

        const mediaPresignResult = await s3Service.getPresignedURL({
        filename: item.mediaFile.name,
        contentType: item.contentType,
        contentLength: item.mediaFile.size,
        relativePath: uploadRelativePath,
        storageSubFolder: item.storageSubFolder,
      });

      if (mediaPresignResult.status !== "ok") {
        throw new Error(`Failed to get upload URL for ${item.mediaFile.name}`);
      }

      await uploadMediaWithProgress(
        item.id,
        item.mediaFile,
        mediaPresignResult.url,
        item.contentType,
      );
    },
    [uploadMediaWithProgress],
  );

  const recordUploadFailure = useCallback(
    (candidate: RetryCandidate, error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      const attempts = candidate.attempts + 1;

      failedUploadCandidatesRef.current[candidate.itemId] = {
        ...candidate,
        attempts,
      };

      setFailedUploads((prev) => {
        const nextFailed: FailedUploadItem = {
          itemId: candidate.itemId,
          filename: candidate.file.name,
          errorMessage,
          attempts,
        };

        const index = prev.findIndex((failed) => failed.itemId === candidate.itemId);
        if (index === -1) {
          return [...prev, nextFailed];
        }

        const updated = [...prev];
        updated[index] = nextFailed;
        return updated;
      });
    },
    [],
  );

  const executeUploadCandidate = useCallback(
    async (candidate: RetryCandidate) => {
      if (candidate.kind === "regular") {
        const presignResult = await s3Service.getPresignedURL({
          filename: candidate.uploadFilename,
          contentType: candidate.file.type,
          contentLength: candidate.file.size,
        });

        if (presignResult.status !== "ok") {
          throw new Error("Failed to get upload URL");
        }

        await uploadMediaWithProgress(
          candidate.itemId,
          candidate.file,
          presignResult.url,
          candidate.file.type,
        );
        return;
      }

      await uploadApprovedTakeoutItem(candidate.takeoutUpload);
    },
    [uploadApprovedTakeoutItem, uploadMediaWithProgress],
  );

  const processUploadCandidate = useCallback(
    async (candidate: RetryCandidate) => {
      try {
        await executeUploadCandidate(candidate);
        clearUploadFailure(candidate.itemId);
      } catch (error) {
        recordUploadFailure(candidate, error);
        throw error;
      }
    },
    [clearUploadFailure, executeUploadCandidate, recordUploadFailure],
  );

  const runRetryBatch = useCallback((itemIds?: string[]) => {
    if (isUploadingRef.current) {
      toast.error("An upload is already in progress. Please wait.");
      return;
    }

    const selectedCandidates = (
      itemIds
        ? itemIds
            .map((itemId) => failedUploadCandidatesRef.current[itemId])
            .filter((candidate): candidate is RetryCandidate => Boolean(candidate))
        : Object.values(failedUploadCandidatesRef.current)
    );

    if (selectedCandidates.length === 0) {
      return;
    }

    const selectedIds = new Set(selectedCandidates.map((candidate) => candidate.itemId));

    isUploadingRef.current = true;
    setIsUploading(true);
    setTotalFiles(selectedCandidates.length);
    setCompletedFiles(0);
    setActiveUploads(0);
    setActiveUploadNames({});
    setCurrentFileName(null);
    setFileSizes(
      Object.fromEntries(
        selectedCandidates.map((candidate) => [candidate.itemId, candidate.file.size]),
      ),
    );
    setUploadStartedAt(null);
    setFileProgresses(
      Object.fromEntries(
        selectedCandidates.map((candidate) => [candidate.itemId, 0]),
      ),
    );
    setFailedUploads((prev) =>
      prev.filter((failedUpload) => !selectedIds.has(failedUpload.itemId)),
    );

    (async () => {
      try {
        const retryPool = createUploadPool(UPLOAD_POOL_CONCURRENCY);
        for (const candidate of selectedCandidates) {
          retryPool.enqueue(async () => {
            try {
              await processUploadCandidate(candidate);
            } catch (error) {
              console.error(`Failed to retry ${candidate.file.name}:`, error);
              toast.error(`Failed to retry ${candidate.file.name}`);
            } finally {
              markUploadComplete(candidate.itemId);
            }
          });
        }
        await retryPool.drain();
      } catch (err) {
        console.error("Retry upload failed:", err);
        toast.error("Retry upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        setCurrentFileName(null);
        isUploadingRef.current = false;
        setUploadStartedAt(null);
      }
    })();
  }, [markUploadComplete, processUploadCandidate]);

  const retryUpload = useCallback((itemId: string) => {
    runRetryBatch([itemId]);
  }, [runRetryBatch]);

  const retryFailedUploads = useCallback(() => {
    runRetryBatch();
  }, [runRetryBatch]);

  const startUpload = useCallback((files: File[]) => {
    if (isUploadingRef.current) {
      toast.error("An upload is already in progress. Please wait.");
      return;
    }

    const uploadItems: UploadItem[] = files.map((file, index) => ({
      id: `${index}-${file.name}-${file.size}-${file.lastModified}`,
      file,
    }));

    isUploadingRef.current = true;
    duplicateDecisionForRestRef.current = null;
    setIsUploading(true);
    setTotalFiles(files.length);
    setCompletedFiles(0);
    setActiveUploads(0);
    setActiveUploadNames({});
    setFileSizes(Object.fromEntries(uploadItems.map((item) => [item.id, item.file.size])));
    setUploadStartedAt(null);
    setFileProgresses({});
    setFailedUploads([]);
    failedUploadCandidatesRef.current = {};

    (async () => {
      try {
        const reviewedUploads: ReviewedUpload[] = [];
        const approvedBatchImages: ApprovedBatchImage[] = [];

        for (const item of uploadItems) {
          setCurrentFileName(item.file.name);

          try {
            const hashData = await getImageHashData(item.file);
            let uploadFilename = item.file.name;

            const localDuplicate = hashData
              ? approvedBatchImages
                  .map((candidate) => ({
                    candidate,
                    distance: hammingDistance(
                      hashData.perceptualHash,
                      candidate.perceptualHash,
                    ),
                  }))
                  .filter(
                    ({ distance }) => distance <= SAME_BATCH_DUPLICATE_THRESHOLD,
                  )
                  .sort((a, b) => a.distance - b.distance)[0]
              : undefined;

            if (hashData && localDuplicate) {
              const previewUrl = URL.createObjectURL(localDuplicate.candidate.item.file);
              const action = await resolveDuplicateAction(
                item.file,
                {
                  id: localDuplicate.candidate.item.id,
                  filename: localDuplicate.candidate.uploadFilename,
                  thumbnailUrl: previewUrl,
                  s3Key: `batch:${localDuplicate.candidate.item.id}`,
                  distance: localDuplicate.distance,
                },
                `data:image/jpeg;base64,${hashData.imageData}`,
                () => URL.revokeObjectURL(previewUrl),
              );

              if (action === "skip") {
                markUploadComplete(item.id);
                continue;
              }

              if (action === "replace") {
                const approvedIndex = reviewedUploads.findIndex(
                  (upload) => upload.item.id === localDuplicate.candidate.item.id,
                );
                if (approvedIndex !== -1) {
                  const [removedUpload] = reviewedUploads.splice(approvedIndex, 1);
                  approvedBatchImages.splice(
                    approvedBatchImages.findIndex(
                      (candidate) =>
                        candidate.item.id === localDuplicate.candidate.item.id,
                    ),
                    1,
                  );
                  markUploadComplete(removedUpload.item.id);
                }
              }

              if (action === "keepBoth") {
                uploadFilename = uniqueFilename(
                  item.file.name,
                  reviewedUploads.map((upload) => upload.uploadFilename),
                );
              }
            }

            const presignResult = await s3Service.getPresignedURL({
              filename: uploadFilename,
              contentType: item.file.type,
              contentLength: item.file.size,
              ...(hashData ? { imageData: hashData.imageData } : {}),
            });

            if (presignResult.status === "quota_exceeded") {
              toast.error(
                `Storage limit reached. Upgrade your plan to upload more files.`,
                { id: "quota_exceeded", duration: 8000 },
              );
              markUploadComplete(item.id);
              continue;
            }

            if (presignResult.status === "duplicate") {
              const bestMatch = presignResult.duplicates[0];
              if (!bestMatch) {
                toast.error(`Failed to get upload URL for ${item.file.name}`);
                markUploadComplete(item.id);
                continue;
              }

              const action = await resolveDuplicateAction(
                item.file,
                bestMatch,
                hashData ? `data:image/jpeg;base64,${hashData.imageData}` : undefined,
              );

              if (action === "skip") {
                markUploadComplete(item.id);
                continue;
              }

              if (action === "replace") {
                try {
                  await api.delete("/api/photos", {
                    keys: presignResult.duplicates.map((duplicate) => duplicate.s3Key),
                  });
                } catch (error) {
                  console.error("Failed to delete existing photo:", error);
                  toast.error(`Failed to replace existing photo for ${item.file.name}`);
                  markUploadComplete(item.id);
                  continue;
                }
              }

              if (action === "keepBoth") {
                uploadFilename = uniqueFilename(
                  item.file.name,
                  [
                    ...reviewedUploads.map((upload) => upload.uploadFilename),
                    ...presignResult.duplicates.map((duplicate) => duplicate.filename),
                  ],
                );
              }
            }

            reviewedUploads.push({ item, uploadFilename });
            if (hashData) {
              approvedBatchImages.push({
                item,
                uploadFilename,
                perceptualHash: hashData.perceptualHash,
              });
            }
          } catch (error) {
            console.error(`Preflight failed for ${item.file.name}:`, error);
            toast.error(`Failed to prepare ${item.file.name} for upload`);
            markUploadComplete(item.id);
          }
        }

        const uploadPool = createUploadPool(UPLOAD_POOL_CONCURRENCY);
        for (const reviewedUpload of reviewedUploads) {
          const candidate: RegularRetryCandidate = {
            kind: "regular",
            itemId: reviewedUpload.item.id,
            file: reviewedUpload.item.file,
            uploadFilename: reviewedUpload.uploadFilename,
            attempts: 0,
          };

          uploadPool.enqueue(async () => {
            try {
              await processUploadCandidate(candidate);
            } catch (error) {
              console.error(`Failed to upload ${reviewedUpload.item.file.name}:`, error);
              toast.error(`Failed to upload ${reviewedUpload.item.file.name}`);
            } finally {
              markUploadComplete(reviewedUpload.item.id);
            }
          });
        }
        await uploadPool.drain();
      } catch (err) {
        console.error("Upload failed:", err);
        toast.error("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        setCurrentFileName(null);
        isUploadingRef.current = false;
        setUploadStartedAt(null);
        duplicateDecisionForRestRef.current = null;
      }
    })();
  }, [markUploadComplete, processUploadCandidate, resolveDuplicateAction]);

  const startGoogleTakeoutUpload = useCallback((files: File[]) => {
    if (isUploadingRef.current) {
      toast.error("An upload is already in progress. Please wait.");
      return;
    }

    isUploadingRef.current = true;
    duplicateDecisionForRestRef.current = null;
    setIsUploading(true);
    setTotalFiles(0);
    setCompletedFiles(0);
    setActiveUploads(0);
    setActiveUploadNames({});
    setFileProgresses({});
    setFailedUploads([]);
    failedUploadCandidatesRef.current = {};

    (async () => {
      const takeoutImportStartedAt = Date.now();
      try {
        const planStartedAt = Date.now();
        const importPlan = await buildGoogleTakeoutImportPlan(
          files,
          createImportId(),
        );
        const planFinishedAt = Date.now();

        if (importPlan.items.length === 0) {
          toast.error("No supported photos or videos were found in that folder.");
          return;
        }

        setTotalFiles(importPlan.items.length);
        setCompletedFiles(0);
        setActiveUploads(0);
        setFileSizes(
          Object.fromEntries(
            importPlan.items.map((item) => [item.id, item.mediaFile.size]),
          ),
        );
        setUploadStartedAt(null);
        setFileProgresses({});

        let reviewedCount = 0;
        let approvedCount = 0;
        let skippedCount = 0;
        let reviewedFailedCount = 0;

        const reviewStartedAt = Date.now();
        const approvedUploads: ApprovedTakeoutUpload[] = [];
        const approvedBatchImages: ApprovedBatchTakeoutImage[] = [];
        const reservedRelativePaths: string[] = [];

        for (const itemChunk of chunkArray(importPlan.items, PREFLIGHT_BATCH_SIZE)) {
          const preparedChunk: PreparedTakeoutItem[] = [];
          const preflightChunk: BatchPreflightItem[] = [];

          for (const item of itemChunk) {
            setCurrentFileName(item.mediaFile.name);

            let hashData: PreparedTakeoutItem["hashData"] = null;
            if (item.contentType.startsWith("image/")) {
              hashData = await getImageHashData(item.mediaFile);
            }

            preparedChunk.push({ item, hashData });
            preflightChunk.push({
              clientId: item.id,
              filename: item.mediaFile.name,
              contentType: item.contentType,
              contentLength: item.mediaFile.size,
              relativePath: item.uploadRelativePath,
              storageSubFolder: item.storageSubFolder,
            });
          }

          const preflightResults = new Map<string, BatchPreflightResult>();
          const response = await s3Service.preflightUploads(preflightChunk);
          for (const result of response.results) {
            preflightResults.set(result.clientId, result);
          }

          for (const prepared of preparedChunk) {
            const { item, hashData } = prepared;
            setCurrentFileName(item.mediaFile.name);

            try {
              reviewedCount++;

              let reviewedUpload: ApprovedTakeoutUpload = {
                item,
                uploadRelativePath: item.uploadRelativePath,
                sidecarUploadRelativePath: item.sidecarFile
                  ? `${item.uploadRelativePath}.json`
                  : null,
              };

              const localDuplicate = hashData
                ? approvedBatchImages
                    .map((candidate) => ({
                      candidate,
                      distance: hammingDistance(
                        hashData.perceptualHash,
                        candidate.perceptualHash,
                      ),
                    }))
                    .filter(
                      ({ distance }) => distance <= SAME_BATCH_DUPLICATE_THRESHOLD,
                    )
                    .sort((a, b) => a.distance - b.distance)[0]
                : undefined;

              if (hashData && localDuplicate) {
                const previewUrl = URL.createObjectURL(localDuplicate.candidate.file);
                const action = await resolveDuplicateAction(
                  item.mediaFile,
                  {
                    id: localDuplicate.candidate.itemId,
                    filename: localDuplicate.candidate.file.name,
                    thumbnailUrl: previewUrl,
                    s3Key: `batch:${localDuplicate.candidate.itemId}`,
                    distance: localDuplicate.distance,
                  },
                  `data:image/jpeg;base64,${hashData.imageData}`,
                  () => URL.revokeObjectURL(previewUrl),
                );

                if (action === "skip") {
                  skippedCount++;
                  markUploadComplete(item.id);
                  continue;
                }

                if (action === "replace") {
                  const approvedIndex = approvedUploads.findIndex(
                    (upload) => upload.item.id === localDuplicate.candidate.itemId,
                  );
                  if (approvedIndex !== -1) {
                    const [removedUpload] = approvedUploads.splice(approvedIndex, 1);
                    const imageIndex = approvedBatchImages.findIndex(
                      (candidate) => candidate.itemId === localDuplicate.candidate.itemId,
                    );
                    if (imageIndex !== -1) {
                      approvedBatchImages.splice(imageIndex, 1);
                    }
                    const relativePathIndex = reservedRelativePaths.indexOf(
                      removedUpload.uploadRelativePath,
                    );
                    if (relativePathIndex !== -1) {
                      reservedRelativePaths.splice(relativePathIndex, 1);
                    }
                    markUploadComplete(removedUpload.item.id);
                  }
                }
              }

              const preflightResult =
                preflightResults.get(item.id) ?? ({ clientId: item.id, status: "new" } as BatchPreflightResult);

              if (preflightResult.status === "quota_exceeded") {
                toast.error(
                  `Storage limit reached. Upgrade your plan to upload more files.`,
                  { id: "quota_exceeded", duration: 8000 },
                );
                skippedCount++;
                markUploadComplete(item.id);
                continue;
              }

              if (preflightResult.status === "duplicate") {
                const bestMatch = preflightResult.duplicates[0];
                if (!bestMatch) {
                  throw new Error(`Failed to resolve duplicate for ${item.mediaFile.name}`);
                }

                const action = await resolveDuplicateAction(
                  item.mediaFile,
                  bestMatch,
                  hashData ? `data:image/jpeg;base64,${hashData.imageData}` : undefined,
                );

                if (action === "skip") {
                  skippedCount++;
                  markUploadComplete(item.id);
                  continue;
                }

                if (action === "replace") {
                  try {
                    await api.delete("/api/photos", {
                      keys: preflightResult.duplicates.map((duplicate) => duplicate.s3Key),
                    });
                  } catch (error) {
                    console.error("Failed to delete existing photo:", error);
                    toast.error(`Failed to replace existing photo for ${item.mediaFile.name}`);
                    skippedCount++;
                    markUploadComplete(item.id);
                    continue;
                  }
                }

                if (action === "keepBoth") {
                  const uniquePath = uniqueRelativePath(item.uploadRelativePath, [
                    ...reservedRelativePaths,
                    item.uploadRelativePath,
                  ]);
                  reviewedUpload = {
                    item,
                    uploadRelativePath: uniquePath,
                    sidecarUploadRelativePath: item.sidecarFile ? `${uniquePath}.json` : null,
                  };
                }
              }

              reservedRelativePaths.push(reviewedUpload.uploadRelativePath);
              approvedUploads.push(reviewedUpload);
              approvedCount++;

              if (hashData) {
                approvedBatchImages.push({
                  itemId: item.id,
                  file: item.mediaFile,
                  uploadRelativePath: reviewedUpload.uploadRelativePath,
                  perceptualHash: hashData.perceptualHash,
                });
              }

            } catch (error) {
              reviewedFailedCount++;
              console.error(`Failed to review ${item.mediaFile.name}:`, error);
              toast.error(`Failed to import ${item.mediaFile.name}`);
              markUploadComplete(item.id);
            }
          }
        }
        const reviewFinishedAt = Date.now();

        const takeoutPool = createUploadPool(UPLOAD_POOL_CONCURRENCY);
        const uploadStartedAt = Date.now();
        for (const reviewedUpload of approvedUploads) {
          const candidate: TakeoutRetryCandidate = {
            kind: "takeout",
            itemId: reviewedUpload.item.id,
            file: reviewedUpload.item.mediaFile,
            takeoutUpload: reviewedUpload,
            attempts: 0,
          };

          takeoutPool.enqueue(async () => {
            try {
              await processUploadCandidate(candidate);
            } catch (error) {
              console.error(`Failed to upload ${reviewedUpload.item.mediaFile.name}:`, error);
              toast.error(`Failed to upload ${reviewedUpload.item.mediaFile.name}`);
            } finally {
              markUploadComplete(reviewedUpload.item.id);
            }
          });
        }
        await takeoutPool.drain();
        const uploadFinishedAt = Date.now();

        if (importPlan.missingSidecarCount > 0) {
          console.warn(
            `${importPlan.missingSidecarCount} Google Takeout file(s) were imported without matching JSON sidecars.`,
          );
        }

        if (importPlan.unmatchedJsonCount > 0) {
          console.warn(
            `${importPlan.unmatchedJsonCount} Google Takeout JSON file(s) did not match any selected media file.`,
          );
        }

        logUploadTiming("takeout", {
          totalMs: Date.now() - takeoutImportStartedAt,
          planMs: planFinishedAt - planStartedAt,
          reviewMs: reviewFinishedAt - reviewStartedAt,
          uploadMs: uploadFinishedAt - uploadStartedAt,
          items: importPlan.items.length,
          reviewed: reviewedCount,
          approved: approvedCount,
          skipped: skippedCount,
          reviewFailed: reviewedFailedCount,
          pool: UPLOAD_POOL_CONCURRENCY,
          missingSidecars: importPlan.missingSidecarCount,
          unmatchedJson: importPlan.unmatchedJsonCount,
        });
      } catch (err) {
        console.error("Google Takeout import failed:", err);
        toast.error("Google Takeout import failed. Please try again.");
      } finally {
        setIsUploading(false);
        setCurrentFileName(null);
        isUploadingRef.current = false;
        setUploadStartedAt(null);
        duplicateDecisionForRestRef.current = null;
      }
    })();
  }, [markUploadComplete, processUploadCandidate, resolveDuplicateAction]);

  return (
    <UploadContext.Provider
      value={{
        isUploading,
        totalFiles,
        completedFiles,
        activeUploads,
        activeUploadNames,
        currentFileName,
        fileSizes,
        fileProgresses,
        uploadStartedAt,
        failedUploads,
        startUpload,
        startGoogleTakeoutUpload,
        retryUpload,
        retryFailedUploads,
      }}
    >
      {children}
      {pendingDuplicate && (
        <DuplicateUploadModal
          file={pendingDuplicate.file}
          duplicate={pendingDuplicate.duplicate}
          previewSrc={pendingDuplicate.previewSrc}
          onResolve={handleDuplicateResolved}
        />
      )}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
