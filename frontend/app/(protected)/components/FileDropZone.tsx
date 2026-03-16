"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { s3Service, type DuplicatePhoto } from "@/app/lib/services/s3.service";
import { api } from "@/app/lib/api";
import { getImageDataForHash } from "@/app/lib/utils/image-hash";
import DuplicateUploadModal from "./DuplicateUploadModal";

interface FileDropZoneProps {
  onUploadComplete?: () => void;
}

interface PendingDuplicate {
  file: File;
  duplicate: DuplicatePhoto;
  resolve: (action: "keepBoth" | "skip" | "replace") => void;
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

const FileDropZone: React.FC<FileDropZoneProps> = ({ onUploadComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileProgresses, setFileProgresses] = useState<Record<string, number>>(
    {},
  );
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null);

  const askAboutDuplicate = (file: File, duplicate: DuplicatePhoto): Promise<"keepBoth" | "skip" | "replace"> => {
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
    removeFile(file.name);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files).filter((file) => {
      if (
        file.name.toLowerCase().endsWith(".avi") ||
        file.type === "video/x-msvideo" ||
        file.type === "video/avi"
      ) {
        toast.error(
          `${file.name}: AVI files are not supported. Please convert to MP4 or MOV.`,
        );
        return false;
      }
      return true;
    });
    if (newFiles.length === 0) return;
    setUploadedFiles((prev) => [...prev, ...newFiles]);

    // Process files sequentially so we can pause for modal input
    for (const file of newFiles) {
      const imageData = await getImageDataForHash(file);
      const presignResult = await s3Service.getPresignedURL({
        filename: file.name,
        contentType: file.type,
        ...(imageData ? { imageData } : {}),
      });

      if (presignResult.status === "duplicate") {
        const bestMatch = presignResult.duplicates[0];
        const action = await askAboutDuplicate(file, bestMatch);

        if (action === "skip") {
          removeFile(file.name);
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
            removeFile(file.name);
            continue;
          }
        }

        // keepBoth or replace: re-fetch presign without imageData to skip re-check
        // For keepBoth, avoid overwriting the existing S3 object if filenames match
        const uploadFilename =
          action === "keepBoth"
            ? uniqueFilename(file.name, presignResult.duplicates.map((d) => d.filename))
            : file.name;

        const retryResult = await s3Service.getPresignedURL({
          filename: uploadFilename,
          contentType: file.type,
        });

        if (retryResult.status !== "ok") {
          toast.error(`Failed to get upload URL for ${file.name}`);
          removeFile(file.name);
          continue;
        }

        await uploadFile(file, retryResult.url);
        continue;
      }

      await uploadFile(file, presignResult.url);
    }

    onUploadComplete?.();
  };

  const handleBoxClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (filename: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.name !== filename));
    setFileProgresses((prev) => {
      const newProgresses = { ...prev };
      delete newProgresses[filename];
      return newProgresses;
    });
  };

  return (
    <>
      {pendingDuplicate && (
        <DuplicateUploadModal
          file={pendingDuplicate.file}
          duplicate={pendingDuplicate.duplicate}
          onKeepBoth={() => handleDuplicateResolved("keepBoth")}
          onSkip={() => handleDuplicateResolved("skip")}
          onReplaceExisting={() => handleDuplicateResolved("replace")}
        />
      )}
      <div className="px-6">
        <div
          className="border-2 border-dashed border-border rounded-md p-8 flex flex-col items-center justify-center text-center cursor-pointer"
          onClick={handleBoxClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="mb-2 bg-muted rounded-full p-3">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Upload a project image
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or,{" "}
            <label
              htmlFor="fileUpload"
              className="text-primary hover:text-primary/90 font-medium cursor-pointer"
              onClick={(e) => e.stopPropagation()} // Prevent triggering handleBoxClick
            >
              click to browse
            </label>{" "}
          </p>
          <input
            type="file"
            id="fileUpload"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,video/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      </div>
      <div
        className={cn(
          "px-6 pb-5 space-y-3",
          uploadedFiles.length > 0 ? "mt-4" : "",
        )}
      >
        {uploadedFiles.map((file, index) => {
          const imageUrl = URL.createObjectURL(file);

          return (
            <div
              className="border border-border rounded-lg p-2 flex flex-col"
              key={file.name + index}
              onLoad={() => {
                return () => URL.revokeObjectURL(imageUrl);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-18 h-14 bg-muted rounded-sm self-start row-span-2 overflow-hidden relative">
                  <Image
                    unoptimized
                    src={imageUrl}
                    alt={file.name}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex-1 pr-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate max-w-62.5">
                        {file.name}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="bg-transparent! hover:text-red-500"
                      onClick={() => removeFile(file.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex-1">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${fileProgresses[file.name] || 0}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {Math.round(fileProgresses[file.name] || 0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default FileDropZone;
