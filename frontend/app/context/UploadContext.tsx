"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  s3Service,
  type DuplicatePhoto,
  type PresignResponse,
} from "@/app/lib/services/s3.service";
import { api } from "@/app/lib/api";
import { getImageDataForHash } from "@/app/lib/utils/image-hash";
import DuplicateUploadModal from "@/app/(protected)/components/DuplicateUploadModal";

interface PendingDuplicate {
  file: File;
  duplicate: DuplicatePhoto;
  resolve: (action: "keepBoth" | "skip" | "replace") => void;
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

type PreflightSuccess = {
  item: UploadItem;
  presignResult: PresignResponse;
};

type DuplicatePreflight = {
  item: UploadItem;
  presignResult: Extract<PresignResponse, { status: "duplicate" }>;
};

type PreflightFailure = {
  item: UploadItem;
  error: unknown;
};

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
  ): Promise<"keepBoth" | "skip" | "replace"> => {
    return new Promise((resolve) => {
      setPendingDuplicate({ file, duplicate, resolve });
    });
  };

  const handleDuplicateResolved = (action: "keepBoth" | "skip" | "replace") => {
    if (pendingDuplicate) {
      pendingDuplicate.resolve(action);
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
        const preflightResults = await Promise.all(
          uploadItems.map(async (item): Promise<PreflightSuccess | PreflightFailure> => {
            try {
              const imageData = await getImageDataForHash(item.file);
              const presignResult = await s3Service.getPresignedURL({
                filename: item.file.name,
                contentType: item.file.type,
                contentLength: item.file.size,
                ...(imageData ? { imageData } : {}),
              });

              return { item, presignResult };
            } catch (error) {
              return { item, error };
            }
          }),
        );

        const uploadTasks: Promise<void>[] = [];
        const duplicateTasks: DuplicatePreflight[] = [];

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

        const processDuplicate = async (
          item: UploadItem,
          presignResult: Extract<PresignResponse, { status: "duplicate" }>,
        ) => {
          const bestMatch = presignResult.duplicates[0];
          if (!bestMatch) {
            toast.error(`Failed to get upload URL for ${item.file.name}`);
            markFileComplete(item);
            return;
          }

          const action = await askAboutDuplicate(item.file, bestMatch);

          if (action === "skip") {
            markFileComplete(item);
            return;
          }

          if (action === "replace") {
            try {
              await api.delete("/api/photos", {
                keys: presignResult.duplicates.map((d) => d.s3Key),
              });
            } catch (error) {
              console.error("Failed to delete existing photo:", error);
              toast.error(`Failed to replace existing photo for ${item.file.name}`);
              markFileComplete(item);
              return;
            }
          }

          const uploadFilename =
            action === "keepBoth"
              ? uniqueFilename(
                  item.file.name,
                  presignResult.duplicates.map((d) => d.filename),
                )
              : item.file.name;

          try {
            const retryResult = await s3Service.getPresignedURL({
              filename: uploadFilename,
              contentType: item.file.type,
              contentLength: item.file.size,
            });

            if (retryResult.status !== "ok") {
              toast.error(`Failed to get upload URL for ${item.file.name}`);
              markFileComplete(item);
              return;
            }

            await uploadWithProgress(item, retryResult.url);
          } catch (error) {
            console.error(`Failed to upload duplicate ${item.file.name}:`, error);
            toast.error(`Failed to upload ${item.file.name}`);
            markFileComplete(item);
          }
        };

        for (const result of preflightResults) {
          if ("error" in result) {
            console.error(`Preflight failed for ${result.item.file.name}:`, result.error);
            toast.error(`Failed to prepare ${result.item.file.name} for upload`);
            markFileComplete(result.item);
            continue;
          }

          if (result.presignResult.status === "quota_exceeded") {
            toast.error(
              `Storage limit reached. Upgrade your plan to upload more files.`,
              { id: "quota_exceeded", duration: 8000 },
            );
            markFileComplete(result.item);
            continue;
          }

          if (result.presignResult.status === "duplicate") {
            duplicateTasks.push({
              item: result.item,
              presignResult: result.presignResult,
            });
            continue;
          }

          uploadTasks.push(uploadWithProgress(result.item, result.presignResult.url));
        }

        const duplicateQueue = (async () => {
          for (const result of duplicateTasks) {
            await processDuplicate(result.item, result.presignResult);
          }
        })();

        await Promise.all([Promise.all(uploadTasks), duplicateQueue]);
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
          onKeepBoth={() => handleDuplicateResolved("keepBoth")}
          onSkip={() => handleDuplicateResolved("skip")}
          onReplaceExisting={() => handleDuplicateResolved("replace")}
        />
      )}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
