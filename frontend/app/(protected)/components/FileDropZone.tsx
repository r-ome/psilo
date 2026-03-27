"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useUpload } from "@/app/context/UploadContext";

interface FileDropZoneProps {
  onFilesAccepted?: () => void;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesAccepted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startUpload } = useUpload();

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files).filter((file) => {
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
    if (validFiles.length === 0) return;

    startUpload(validFiles);
    onFilesAccepted?.();
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

  return (
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
            onClick={(e) => e.stopPropagation()}
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
  );
};

export default FileDropZone;
