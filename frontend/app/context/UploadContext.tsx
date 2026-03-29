"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { s3Service, type DuplicatePhoto } from "@/app/lib/services/s3.service";
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
  currentFileName: string | null;
  fileProgresses: Record<string, number>;
  startUpload: (files: File[]) => void;
};

const initialValue: UploadContextValue = {
  isUploading: false,
  totalFiles: 0,
  completedFiles: 0,
  currentFileName: null,
  fileProgresses: {},
  startUpload: () => {},
};

const UploadContext = createContext<UploadContextValue>(initialValue);

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

  const uploadFile = async (file: File, presignedUrl: string) => {
    await s3Service.uploadToS3(presignedUrl, file, (percent) =>
      setFileProgresses((prev) => ({ ...prev, [file.name]: percent })),
    );
    setCompletedFiles((prev) => prev + 1);
  };

  const startUpload = useCallback((files: File[]) => {
    if (isUploadingRef.current) {
      toast.error("An upload is already in progress. Please wait.");
      return;
    }

    isUploadingRef.current = true;
    setIsUploading(true);
    setTotalFiles(files.length);
    setCompletedFiles(0);
    setFileProgresses({});

    (async () => {
      for (const file of files) {
        setCurrentFileName(file.name);

        const imageData = await getImageDataForHash(file);
        const presignResult = await s3Service.getPresignedURL({
          filename: file.name,
          contentType: file.type,
          contentLength: file.size,
          ...(imageData ? { imageData } : {}),
        });

        if (presignResult.status === "quota_exceeded") {
          toast.error(
            `Storage limit reached. Upgrade your plan to upload more files.`,
            { id: "quota_exceeded", duration: 8000 },
          );
          setCompletedFiles((prev) => prev + 1);
          continue;
        }

        if (presignResult.status === "duplicate") {
          const bestMatch = presignResult.duplicates[0];
          const action = await askAboutDuplicate(file, bestMatch);

          if (action === "skip") {
            setCompletedFiles((prev) => prev + 1);
            continue;
          }

          if (action === "replace") {
            try {
              await api.delete("/api/photos", {
                keys: presignResult.duplicates.map((d) => d.s3Key),
              });
            } catch (err) {
              console.error("Failed to delete existing photo:", err);
              toast.error(`Failed to replace existing photo for ${file.name}`);
              setCompletedFiles((prev) => prev + 1);
              continue;
            }
          }

          const uploadFilename =
            action === "keepBoth"
              ? uniqueFilename(
                  file.name,
                  presignResult.duplicates.map((d) => d.filename),
                )
              : file.name;

          const retryResult = await s3Service.getPresignedURL({
            filename: uploadFilename,
            contentType: file.type,
            contentLength: file.size,
          });

          if (retryResult.status !== "ok") {
            toast.error(`Failed to get upload URL for ${file.name}`);
            setCompletedFiles((prev) => prev + 1);
            continue;
          }

          await uploadFile(file, retryResult.url);
          continue;
        }

        await uploadFile(file, presignResult.url);
      }

      setIsUploading(false);
      setCurrentFileName(null);
      isUploadingRef.current = false;
    })();
  }, []);

  return (
    <UploadContext.Provider
      value={{
        isUploading,
        totalFiles,
        completedFiles,
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
