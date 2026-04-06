"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  s3Service,
  type DuplicatePhoto,
  type PresignResponse,
} from "@/app/lib/services/s3.service";
import { api } from "@/app/lib/api";
import { getImageHashData, hammingDistance } from "@/app/lib/utils/image-hash";
import DuplicateUploadModal from "@/app/(protected)/components/DuplicateUploadModal";

interface PendingDuplicate {
  file: File;
  duplicate: DuplicatePhoto;
  previewSrc?: string;
  resolve: (action: "keepBoth" | "skip" | "replace") => void;
  cleanup?: () => void;
}

type UploadContextValue = {
  isUploading: boolean;
  totalFiles: number;
  completedFiles: number;
  activeUploads: number;
  currentFileName: string | null;
  fileProgresses: Record<string, number>;
  startUpload: (files: File[]) => void;
};

const initialValue: UploadContextValue = {
  isUploading: false,
  totalFiles: 0,
  completedFiles: 0,
  activeUploads: 0,
  currentFileName: null,
  fileProgresses: {},
  startUpload: () => {},
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

type ApprovedBatchImage = {
  item: UploadItem;
  uploadFilename: string;
  perceptualHash: string;
};

const SAME_BATCH_DUPLICATE_THRESHOLD = 10;

function uniqueFilename(filename: string, existingFilenames: string[]): string {
  if (!existingFilenames.includes(filename)) return filename;
  const lastDot = filename.lastIndexOf(".");
  const base = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot !== -1 ? filename.slice(lastDot) : "";
  let counter = 1;
  while (existingFilenames.includes(`${base}_${counter}${ext}`)) counter++;
  return `${base}_${counter}${ext}`;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [isUploading, setIsUploading] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [completedFiles, setCompletedFiles] = useState(0);
  const [activeUploads, setActiveUploads] = useState(0);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [fileProgresses, setFileProgresses] = useState<Record<string, number>>(
    {},
  );
  const [pendingDuplicate, setPendingDuplicate] =
    useState<PendingDuplicate | null>(null);
  const isUploadingRef = useRef(false);

  const askAboutDuplicate = (
    file: File,
    duplicate: DuplicatePhoto,
    previewSrc?: string,
    cleanup?: () => void,
  ): Promise<"keepBoth" | "skip" | "replace"> => {
    return new Promise((resolve) => {
      setPendingDuplicate({ file, duplicate, previewSrc, resolve, cleanup });
    });
  };

  const handleDuplicateResolved = (action: "keepBoth" | "skip" | "replace") => {
    if (pendingDuplicate) {
      pendingDuplicate.resolve(action);
      pendingDuplicate.cleanup?.();
      setPendingDuplicate(null);
    }
  };

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
    setIsUploading(true);
    setTotalFiles(files.length);
    setCompletedFiles(0);
    setActiveUploads(0);
    setFileProgresses({});

    (async () => {
      try {
        const markFileComplete = (item: UploadItem) => {
          setFileProgresses((prev) => ({ ...prev, [item.id]: 100 }));
          setCompletedFiles((prev) => prev + 1);
        };

        const uploadWithProgress = async (
          item: UploadItem,
          presignedUrl: string,
        ) => {
          setActiveUploads((prev) => prev + 1);
          setCurrentFileName(item.file.name);

          try {
            await s3Service.uploadToS3(presignedUrl, item.file, (percent) =>
              setFileProgresses((prev) => ({ ...prev, [item.id]: percent })),
            );
          } catch (error) {
            console.error(`Upload failed for ${item.file.name}:`, error);
            toast.error(`Failed to upload ${item.file.name}`);
          } finally {
            markFileComplete(item);
            setActiveUploads((prev) => Math.max(prev - 1, 0));
          }
        };

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
              const action = await askAboutDuplicate(
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
                markFileComplete(item);
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
                  markFileComplete(removedUpload.item);
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
              markFileComplete(item);
              continue;
            }

            if (presignResult.status === "duplicate") {
              const bestMatch = presignResult.duplicates[0];
              if (!bestMatch) {
                toast.error(`Failed to get upload URL for ${item.file.name}`);
                markFileComplete(item);
                continue;
              }

              const action = await askAboutDuplicate(
                item.file,
                bestMatch,
                hashData ? `data:image/jpeg;base64,${hashData.imageData}` : undefined,
              );

              if (action === "skip") {
                markFileComplete(item);
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
                  markFileComplete(item);
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
            markFileComplete(item);
          }
        }

        for (const reviewedUpload of reviewedUploads) {
          try {
            const presignResult = await s3Service.getPresignedURL({
              filename: reviewedUpload.uploadFilename,
              contentType: reviewedUpload.item.file.type,
              contentLength: reviewedUpload.item.file.size,
            });

            if (presignResult.status !== "ok") {
              toast.error(`Failed to get upload URL for ${reviewedUpload.item.file.name}`);
              markFileComplete(reviewedUpload.item);
              continue;
            }

            await uploadWithProgress(reviewedUpload.item, presignResult.url);
          } catch (error) {
            console.error(`Failed to upload ${reviewedUpload.item.file.name}:`, error);
            toast.error(`Failed to upload ${reviewedUpload.item.file.name}`);
            markFileComplete(reviewedUpload.item);
          }
        }
      } catch (err) {
        console.error("Upload failed:", err);
        toast.error("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        setCurrentFileName(null);
        isUploadingRef.current = false;
      }
    })();
  }, []);

  return (
    <UploadContext.Provider
      value={{
        isUploading,
        totalFiles,
        completedFiles,
        activeUploads,
        currentFileName,
        fileProgresses,
        startUpload,
      }}
    >
      {children}
      {pendingDuplicate && (
        <DuplicateUploadModal
          file={pendingDuplicate.file}
          duplicate={pendingDuplicate.duplicate}
          previewSrc={pendingDuplicate.previewSrc}
          onKeepBoth={() => handleDuplicateResolved("keepBoth")}
          onSkip={() => handleDuplicateResolved("skip")}
          onReplaceExisting={() => handleDuplicateResolved("replace")}
        />
      )}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
